const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;

let jwksClient = null;
function getJwksClient() {
  if (!jwksClient && AUTH0_DOMAIN) {
    jwksClient = jwksRsa({
      jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
    });
  }
  return jwksClient;
}

function getSigningKey(header) {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password and name are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email.toLowerCase().trim(), hash, name.trim()]
    );
    const user = rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error('[Auth] register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('[Auth] login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Auth0 social login — exchanges an Auth0 ID token for an app JWT
router.post('/oauth', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'id_token required' });
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    return res.status(503).json({ error: 'Social login not configured on this server' });
  }

  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(
        id_token,
        (header, cb) => getSigningKey(header).then(k => cb(null, k)).catch(cb),
        { issuer: `https://${AUTH0_DOMAIN}/`, audience: AUTH0_CLIENT_ID },
        (err, payload) => err ? reject(err) : resolve(payload)
      );
    });

    const email = decoded.email;
    if (!email) return res.status(400).json({ error: 'No email in token' });

    const name = decoded.name || decoded.nickname || email.split('@')[0];

    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, NULL)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name)
       RETURNING id, email, name`,
      [email.toLowerCase().trim(), name]
    );

    const user = rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error('[Auth] OAuth error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
