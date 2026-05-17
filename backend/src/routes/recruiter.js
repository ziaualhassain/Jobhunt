const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Middleware: verify recruiter role via DB (JWT payload only has id/email)
router.use(async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'recruiter')
      return res.status(403).json({ error: 'Recruiter access only' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_APP_STATUSES = ['Applied', 'Reviewing', 'Shortlisted', 'Rejected', 'Hired'];

// GET /api/recruiter/jobs — list my posted jobs
router.get('/jobs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM jobhunter_jobs WHERE recruiter_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recruiter/jobs — post a new job
router.post('/jobs', async (req, res) => {
  const { title, description, location, jobType, experienceLevel, skills, salary } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO jobhunter_jobs
         (recruiter_id, title, description, location, job_type, experience_level, skills, salary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, title.trim(), description ?? '', location ?? 'Remote',
       jobType ?? 'Full-time', experienceLevel ?? 'Mid-level',
       skills ?? '', salary ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recruiter/jobs/:id — update a job
router.patch('/jobs/:id', async (req, res) => {
  const { title, description, location, jobType, experienceLevel, skills, salary, isActive } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE jobhunter_jobs
       SET title            = COALESCE($1, title),
           description      = COALESCE($2, description),
           location         = COALESCE($3, location),
           job_type         = COALESCE($4, job_type),
           experience_level = COALESCE($5, experience_level),
           skills           = COALESCE($6, skills),
           salary           = COALESCE($7, salary),
           is_active        = COALESCE($8, is_active),
           updated_at       = NOW()
       WHERE id = $9 AND recruiter_id = $10
       RETURNING *`,
      [title ?? null, description ?? null, location ?? null, jobType ?? null,
       experienceLevel ?? null, skills ?? null, salary ?? null,
       isActive ?? null, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recruiter/jobs/:id
router.delete('/jobs/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM jobhunter_jobs WHERE id = $1 AND recruiter_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recruiter/jobs/:id/applicants — view applicants
router.get('/jobs/:id/applicants', async (req, res) => {
  try {
    // Verify the job belongs to this recruiter
    const { rows: job } = await pool.query(
      'SELECT id FROM jobhunter_jobs WHERE id = $1 AND recruiter_id = $2',
      [req.params.id, req.user.id]
    );
    if (!job[0]) return res.status(404).json({ error: 'Not found' });

    const { rows } = await pool.query(
      `SELECT ja.id, ja.job_id, ja.user_id, ja.cover_letter, ja.status, ja.applied_at, ja.updated_at,
              u.name AS applicant_name, u.email AS applicant_email
       FROM job_applications ja
       JOIN users u ON u.id = ja.user_id
       WHERE ja.job_id = $1
       ORDER BY ja.applied_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recruiter/jobs/:jobId/applicants/:userId — update applicant status
router.patch('/jobs/:jobId/applicants/:userId', async (req, res) => {
  const { status } = req.body;
  if (!VALID_APP_STATUSES.includes(status))
    return res.status(400).json({ error: `Invalid status. Valid: ${VALID_APP_STATUSES.join(', ')}` });

  try {
    // Verify the job belongs to this recruiter
    const { rows: job } = await pool.query(
      'SELECT id FROM jobhunter_jobs WHERE id = $1 AND recruiter_id = $2',
      [req.params.jobId, req.user.id]
    );
    if (!job[0]) return res.status(404).json({ error: 'Not found' });

    const { rows } = await pool.query(
      `UPDATE job_applications SET status = $1, updated_at = NOW()
       WHERE job_id = $2 AND user_id = $3 RETURNING *`,
      [status, req.params.jobId, req.params.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Application not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
