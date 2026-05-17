'use strict';

const express = require('express');
const requireAuth = require('../middleware/auth');
const { pool } = require('../db/database');
const { scrapeCareerPage, upsertJobs } = require('../services/careerPageScraper');

const router = express.Router();
router.use(requireAuth);

// GET /api/career-pages — list user's watched companies with job counts
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        wc.id, wc.company_name, wc.career_url, wc.last_scraped_at,
        wc.scrape_error, wc.job_count, wc.created_at,
        (SELECT COUNT(*) FROM career_page_jobs cpj WHERE cpj.career_url = wc.career_url) AS total_jobs
      FROM watched_companies wc
      WHERE wc.user_id = $1 AND wc.is_active = true
      ORDER BY wc.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('[CareerPages] list failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/career-pages — add a company to the watchlist
router.post('/', async (req, res) => {
  const { company_name, career_url } = req.body;
  if (!company_name || !career_url) {
    return res.status(400).json({ error: 'company_name and career_url are required' });
  }
  // Basic URL validation
  try { new URL(career_url); } catch {
    return res.status(400).json({ error: 'career_url must be a valid URL' });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO watched_companies (user_id, company_name, career_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, career_url) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        is_active    = true
      RETURNING *
    `, [req.user.id, company_name.trim(), career_url.trim()]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[CareerPages] add failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/career-pages/:id — remove from watchlist
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE watched_companies SET is_active = false WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/career-pages/:id/scrape — manually trigger a scrape for one entry
router.post('/:id/scrape', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM watched_companies WHERE id = $1 AND user_id = $2 AND is_active = true',
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const { company_name, career_url } = rows[0];
    const { jobs, error } = await scrapeCareerPage(company_name, career_url);
    await upsertJobs(jobs, career_url, company_name);

    await pool.query(
      'UPDATE watched_companies SET last_scraped_at = NOW(), scrape_error = $1, job_count = $2 WHERE id = $3',
      [error, jobs.length, req.params.id],
    );

    res.json({ scraped: jobs.length, error });
  } catch (err) {
    console.error('[CareerPages] manual scrape failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/career-pages/jobs — jobs from user's watched companies
router.get('/jobs', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cpj.*
      FROM career_page_jobs cpj
      JOIN watched_companies wc ON wc.career_url = cpj.career_url
      WHERE wc.user_id = $1 AND wc.is_active = true
      ORDER BY cpj.scraped_at DESC
      LIMIT 200
    `, [req.user.id]);
    res.json(rows.map(r => ({
      job_id:      r.job_id,
      title:       r.title,
      company:     r.company_name,
      location:    r.location || 'Not specified',
      region:      r.region || '',
      url:         r.url,
      description: r.description || '',
      salary:      '',
      job_type:    r.job_type || 'Full-time',
      source:      'Company Watch',
      tags:        r.tags || '',
      logo:        '',
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
