const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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
  `);
  // Add preferences column if it doesn't exist yet (idempotent migration)
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
  `);
  console.log('[DB] Schema ready');
}

module.exports = { pool, initDb };
