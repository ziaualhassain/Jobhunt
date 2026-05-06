const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const VALID_STATUSES = [
  'saved', 'applied', 'phone_screen', 'technical', 'final_interview', 'offer', 'rejected',
];

// GET /api/applications/stats/summary — must be before /:id
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: stats } = await pool.query(
      'SELECT status, COUNT(*)::int AS count FROM applications WHERE user_id = $1 GROUP BY status',
      [req.user.id]
    );
    const { rows: [{ count: total }] } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM applications WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ total, byStatus: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const { rows } = status
      ? await pool.query(
          'SELECT * FROM applications WHERE user_id = $1 AND status = $2 ORDER BY updated_at DESC',
          [req.user.id, status]
        )
      : await pool.query(
          'SELECT * FROM applications WHERE user_id = $1 ORDER BY updated_at DESC',
          [req.user.id]
        );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM applications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications
router.post('/', async (req, res) => {
  const {
    job_id, title, company, location, url, description,
    salary, job_type, source, tags, status = 'saved', notes = '',
  } = req.body;

  const resolvedTitle = (title || '').trim() || 'Untitled Position';
  const resolvedCompany = (company || '').trim() || 'Unknown Company';

  try {
    const applied_date = status === 'applied' ? new Date().toISOString() : null;
    const { rows } = await pool.query(`
      INSERT INTO applications
        (user_id, job_id, title, company, location, url, description,
         salary, job_type, source, tags, status, notes, applied_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [req.user.id, job_id, resolvedTitle, resolvedCompany, location, url, description,
        salary, job_type, source, tags, status, notes, applied_date]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const { rows } = await pool.query(
        'SELECT id FROM applications WHERE user_id = $1 AND job_id = $2',
        [req.user.id, job_id]
      );
      return res.status(409).json({ error: 'Job already saved', id: rows[0]?.id });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/applications/:id
router.patch('/:id', async (req, res) => {
  const { status, notes } = req.body;

  if (status && !VALID_STATUSES.includes(status))
    return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });

  try {
    const { rows: [existing] } = await pool.query(
      'SELECT * FROM applications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const applied_date =
      status === 'applied' && existing.status !== 'applied'
        ? new Date().toISOString()
        : existing.applied_date;

    const { rows } = await pool.query(`
      UPDATE applications
      SET status      = COALESCE($1, status),
          notes       = COALESCE($2, notes),
          applied_date = $3,
          updated_at  = NOW()
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `, [status ?? null, notes ?? null, applied_date, req.params.id, req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM applications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
