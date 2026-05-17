const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Ensure the resume uploads directory exists at startup
const UPLOAD_DIR = path.join(__dirname, '../../uploads/resumes');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25881'),
  database: process.env.DB_NAME || 'defaultdb',
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.join(__dirname, '../../certs/aiven-ca.pem'), 'utf8'),
  },
});

async function initDb() {
  // Verify connectivity before running DDL
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    throw new Error(
      `Cannot connect to PostgreSQL: ${err.message || err.code || JSON.stringify(err)}\n` +
      `  Host: ${process.env.DB_HOST}:${process.env.DB_PORT || 25881}\n` +
      `  User: ${process.env.DB_USER}\n` +
      `  SSL:  rejectUnauthorized=true`
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      url TEXT,
      description TEXT,
      salary TEXT,
      job_type TEXT,
      source TEXT,
      tags TEXT,
      status TEXT NOT NULL DEFAULT 'saved',
      notes TEXT DEFAULT '',
      applied_date TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      filters JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS theirstack_jobs (
      id SERIAL PRIMARY KEY,
      job_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      url TEXT,
      description TEXT,
      salary TEXT,
      job_type TEXT,
      tags TEXT,
      logo TEXT,
      date_posted DATE,
      fetched_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interview_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      mode TEXT DEFAULT 'practice',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interview_messages (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prep_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      goal TEXT DEFAULT '',
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      timeline_weeks INTEGER DEFAULT 8,
      source TEXT DEFAULT 'ai',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prep_tasks (
      id SERIAL PRIMARY KEY,
      plan_id INTEGER NOT NULL REFERENCES prep_plans(id) ON DELETE CASCADE,
      category TEXT DEFAULT 'General',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      estimated_hours INTEGER DEFAULT 1,
      resources TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prep_checkins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES prep_plans(id) ON DELETE CASCADE,
      checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, plan_id, checkin_date)
    );

    CREATE TABLE IF NOT EXISTS prep_task_messages (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES prep_tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_resumes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Resume',
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      is_primary BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_job_credentials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site TEXT NOT NULL,
      site_email TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, site)
    );
  `);
  // Add preferences column if it doesn't exist yet (idempotent migration)
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
  `);
  // Allow NULL password_hash for OAuth users (Auth0 social login)
  await pool.query(`
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  `);
  // Add region column to theirstack_jobs for country-based filtering
  await pool.query(`
    ALTER TABLE theirstack_jobs ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'India';
  `);
  // Back-fill any existing rows that pre-date the region column
  await pool.query(`
    UPDATE theirstack_jobs SET region = 'India' WHERE region IS NULL;
  `);
  // ── Career page watchlist + scraped jobs ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watched_companies (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name    VARCHAR(200) NOT NULL,
      career_url      TEXT NOT NULL,
      is_active       BOOLEAN DEFAULT true,
      last_scraped_at TIMESTAMPTZ,
      job_count       INTEGER DEFAULT 0,
      scrape_error    TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, career_url)
    );
    CREATE TABLE IF NOT EXISTS default_career_pages (
      id              SERIAL PRIMARY KEY,
      company_name    VARCHAR(200) NOT NULL,
      career_url      TEXT UNIQUE NOT NULL,
      last_scraped_at TIMESTAMPTZ,
      job_count       INTEGER DEFAULT 0,
      scrape_error    TEXT
    );
    CREATE TABLE IF NOT EXISTS careers (
      id           SERIAL PRIMARY KEY,
      job_id       TEXT UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      career_url   TEXT NOT NULL,
      title        TEXT,
      location     TEXT,
      region       TEXT,
      url          TEXT,
      description  TEXT,
      job_type     TEXT DEFAULT 'Full-time',
      tags         TEXT DEFAULT '',
      scraped_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[DB] Schema ready');
}

module.exports = { pool, initDb, UPLOAD_DIR };
