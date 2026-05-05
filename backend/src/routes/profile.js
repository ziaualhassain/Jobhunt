const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/profile
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, preferences, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ...rows[0], preferences: rows[0].preferences || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile
router.put('/', async (req, res) => {
  const { name, preferences, currentPassword, newPassword } = req.body;

  try {
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Password change (optional)
    let passwordHash = user.password_hash;
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required to set a new one' });
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
      passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET name          = COALESCE($1, name),
           preferences   = COALESCE($2, preferences),
           password_hash = $3
       WHERE id = $4
       RETURNING id, email, name, preferences, created_at`,
      [name?.trim() || null, preferences ? JSON.stringify(preferences) : null, passwordHash, req.user.id]
    );
    res.json({ ...rows[0], preferences: rows[0].preferences || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
