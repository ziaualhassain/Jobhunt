const express = require('express');
const router = express.Router();
const db = require('../db/database');

const VALID_STATUSES = [
  'saved', 'applied', 'phone_screen', 'technical', 'final_interview', 'offer', 'rejected'
];

// GET /api/applications
router.get('/', (req, res) => {
  const { status } = req.query;
  const stmt = status
    ? db.prepare('SELECT * FROM applications WHERE status = ? ORDER BY updated_at DESC')
    : db.prepare('SELECT * FROM applications ORDER BY updated_at DESC');
  const rows = status ? stmt.all(status) : stmt.all();
  res.json(rows.map(parseApp));
});

// GET /api/applications/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseApp(row));
});

// POST /api/applications
router.post('/', (req, res) => {
  const {
    job_id, title, company, location, url, description,
    salary, job_type, source, tags, status = 'saved', notes = '',
  } = req.body;

  if (!title || !company) {
    return res.status(400).json({ error: 'title and company are required' });
  }

  // check duplicate
  const existing = db.prepare('SELECT id FROM applications WHERE job_id = ?').get(job_id);
  if (existing) {
    return res.status(409).json({ error: 'Job already saved', id: existing.id });
  }

  const result = db.prepare(`
    INSERT INTO applications (job_id, title, company, location, url, description, salary,
      job_type, source, tags, status, notes, applied_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job_id, title, company, location, url, description,
    salary, job_type, source, tags, status, notes,
    status === 'applied' ? new Date().toISOString() : null
  );

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseApp(row));
});

// PATCH /api/applications/:id
router.patch('/:id', (req, res) => {
  const { status, notes } = req.body;

  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
  }

  const appliedDate =
    status === 'applied' && existing.status !== 'applied'
      ? new Date().toISOString()
      : existing.applied_date;

  db.prepare(`
    UPDATE applications
    SET status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        applied_date = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status ?? null, notes ?? null, appliedDate, req.params.id);

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(parseApp(row));
});

// DELETE /api/applications/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// GET /api/applications/stats/summary
router.get('/stats/summary', (req, res) => {
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM applications GROUP BY status
  `).all();
  const total = db.prepare('SELECT COUNT(*) as count FROM applications').get();
  res.json({ total: total.count, byStatus: stats });
});

function parseApp(row) {
  return { ...row };
}

module.exports = router;
