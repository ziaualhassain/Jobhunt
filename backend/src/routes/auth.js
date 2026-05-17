const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const crypto = require('crypto');
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;

// Simple JWKS cache — avoids hitting Auth0 on every request
let jwksCache = null;
let jwksCacheAt = 0;
const JWKS_TTL = 60 * 60 * 1000; // 1 hour

function fetchJwks() {
  if (jwksCache && Date.now() - jwksCacheAt < JWKS_TTL) return Promise.resolve(jwksCache);
  return new Promise((resolve, reject) => {
    https.get(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          jwksCache = JSON.parse(raw);
          jwksCacheAt = Date.now();
          resolve(jwksCache);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getPublicKey(kid) {
  const { keys } = await fetchJwks();
  const jwk = keys.find(k => k.kid === kid && k.use === 'sig');
  if (!jwk) throw new Error(`Signing key not found for kid: ${kid}`);
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name, role = 'job_seeker', companyName, companyEmail } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password and name are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (role === 'recruiter' && (!companyName || !companyEmail))
    return res.status(400).json({ error: 'companyName and companyEmail are required for recruiters' });
  if (!['job_seeker', 'recruiter'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, company_name, company_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, company_name, company_email, created_at`,
      [email.toLowerCase().trim(), hash, name.trim(), role,
       companyName?.trim() || null, companyEmail?.toLowerCase().trim() || null]
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
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role ?? 'job_seeker' } });
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
        (header, cb) => getPublicKey(header.kid).then(k => cb(null, k)).catch(cb),
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
      'SELECT id, email, name, role, company_name, company_email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    res.json({
      id: u.id, email: u.email, name: u.name,
      role: u.role ?? 'job_seeker',
      companyName: u.company_name,
      companyEmail: u.company_email,
      created_at: u.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
