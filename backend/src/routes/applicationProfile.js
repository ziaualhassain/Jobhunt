'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { randomUUID: uuidv4 } = require('crypto');

const requireAuth = require('../middleware/auth');
const { pool, UPLOAD_DIR } = require('../db/database');
const { encrypt, decrypt } = require('../services/encrypt');

const router = express.Router();
router.use(requireAuth);

// ─── Multer disk storage for resume uploads ───────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, or TXT files are accepted'));
  },
});

// ─── Application profile (stored in users.preferences.applicationProfile) ────

// GET /api/application-profile
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT preferences->'applicationProfile' AS "applicationProfile"
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0].applicationProfile || {});
  } catch (err) {
    console.error('[ApplicationProfile GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/application-profile
router.put('/', async (req, res) => {
  const {
    phone,
    linkedinUrl,
    githubUrl,
    portfolioUrl,
    intro,
    currentCTC,
    expectedCTC,
    noticePeriod,
  } = req.body;

  // Build only the keys that were provided
  const incoming = {};
  if (phone !== undefined) incoming.phone = phone;
  if (linkedinUrl !== undefined) incoming.linkedinUrl = linkedinUrl;
  if (githubUrl !== undefined) incoming.githubUrl = githubUrl;
  if (portfolioUrl !== undefined) incoming.portfolioUrl = portfolioUrl;
  if (intro !== undefined) incoming.intro = intro;
  if (currentCTC !== undefined) incoming.currentCTC = currentCTC;
  if (expectedCTC !== undefined) incoming.expectedCTC = expectedCTC;
  if (noticePeriod !== undefined) incoming.noticePeriod = noticePeriod;

  try {
    // Merge incoming fields into preferences.applicationProfile
    const { rows } = await pool.query(
      `UPDATE users
       SET preferences = jsonb_set(
         COALESCE(preferences, '{}'::jsonb),
         '{applicationProfile}',
         COALESCE(preferences->'applicationProfile', '{}'::jsonb) || $1::jsonb,
         true
       )
       WHERE id = $2
       RETURNING preferences->'applicationProfile' AS "applicationProfile"`,
      [JSON.stringify(incoming), req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0].applicationProfile || {});
  } catch (err) {
    console.error('[ApplicationProfile PUT]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Resume management ────────────────────────────────────────────────────────

// GET /api/application-profile/resumes
router.get('/resumes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, original_name, file_size, is_primary, created_at
       FROM user_resumes
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Resumes GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/application-profile/resumes
router.post('/resumes', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No resume file uploaded (field name: resume)' });

  const label = (req.body.label || 'Resume').trim();

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_resumes (user_id, label, filename, original_name, file_size)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, label, original_name, file_size, is_primary, created_at`,
      [req.user.id, label, req.file.filename, req.file.originalname, req.file.size]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    // Clean up uploaded file if DB insert fails
    fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
    console.error('[Resumes POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/application-profile/resumes/:id/primary
router.patch('/resumes/:id/primary', async (req, res) => {
  const { id } = req.params;
  try {
    // Verify ownership
    const { rows: owned } = await pool.query(
      'SELECT id FROM user_resumes WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (!owned.length) return res.status(404).json({ error: 'Resume not found' });

    // Unset all other primaries for this user, then set this one
    await pool.query('UPDATE user_resumes SET is_primary = false WHERE user_id = $1', [req.user.id]);
    const { rows } = await pool.query(
      `UPDATE user_resumes SET is_primary = true WHERE id = $1
       RETURNING id, label, original_name, file_size, is_primary, created_at`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[Resumes PATCH primary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/application-profile/resumes/:id
router.delete('/resumes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM user_resumes WHERE id = $1 AND user_id = $2 RETURNING filename',
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Resume not found' });

    // Remove file from disk (best-effort)
    const filePath = path.join(UPLOAD_DIR, rows[0].filename);
    fs.unlink(filePath, (err) => {
      if (err) console.warn('[Resumes DELETE] Could not delete file:', filePath, err.message);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Resumes DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Job site credentials ─────────────────────────────────────────────────────

// GET /api/application-profile/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, site, site_email, created_at
       FROM user_job_credentials
       WHERE user_id = $1
       ORDER BY site`,
      [req.user.id]
    );
    // Never return encrypted_password / iv / auth_tag
    res.json(rows);
  } catch (err) {
    console.error('[Credentials GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/application-profile/credentials
router.post('/credentials', async (req, res) => {
  const { site, email, password } = req.body;
  if (!site || !email || !password) {
    return res.status(400).json({ error: 'site, email, and password are required' });
  }

  try {
    const { encrypted, iv, tag } = encrypt(password);

    const { rows } = await pool.query(
      `INSERT INTO user_job_credentials
         (user_id, site, site_email, encrypted_password, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, site) DO UPDATE
         SET site_email         = EXCLUDED.site_email,
             encrypted_password = EXCLUDED.encrypted_password,
             iv                 = EXCLUDED.iv,
             auth_tag           = EXCLUDED.auth_tag,
             created_at         = NOW()
       RETURNING id, site, site_email, created_at`,
      [req.user.id, site.toLowerCase(), email, encrypted, iv, tag]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Credentials POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/application-profile/credentials/:id
router.delete('/credentials/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM user_job_credentials WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Credential not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Credentials DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
