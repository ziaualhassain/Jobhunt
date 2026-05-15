'use strict';

const express = require('express');
const { randomUUID: uuidv4 } = require('crypto');
const path = require('path');

const requireAuth = require('../middleware/auth');
const { pool, UPLOAD_DIR } = require('../db/database');
const { decrypt } = require('../services/encrypt');
const { startApplyJob, applyJobs, createSession, hasSession } = require('../services/autoApply');

const router = express.Router();
router.use(requireAuth);

// Map known job site domains → credential site key
const DOMAIN_TO_SITE = {
  'linkedin.com':     'linkedin',
  'naukri.com':       'naukri',
  'indeed.com':       'indeed',
  'glassdoor.com':    'glassdoor',
  'monster.com':      'monster',
  'shine.com':        'shine',
  'foundit.in':       'foundit',
  'internshala.com':  'internshala',
};

// Map job source names → credential site names (fallback when URL doesn't match)
const SOURCE_TO_SITE = {
  linkedin:    'linkedin',
  naukri:      'naukri',
  indeed:      'indeed',
  glassdoor:   'glassdoor',
  monster:     'monster',
  shine:       'shine',
  foundit:     'foundit',
  internshala: 'internshala',
};

/**
 * Determine which saved credential site to use.
 * Priority: job URL domain > jobSource name.
 * This ensures a LinkedIn job found on Himalayas still uses LinkedIn creds.
 */
function resolveSite(jobUrl, jobSource) {
  // 1. Match on URL domain
  try {
    const hostname = new URL(jobUrl).hostname.replace(/^www\./, '');
    for (const [domain, site] of Object.entries(DOMAIN_TO_SITE)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return site;
    }
  } catch { /* invalid URL — fall through */ }

  // 2. Match on source name
  if (!jobSource) return null;
  const lower = jobSource.toLowerCase();
  if (SOURCE_TO_SITE[lower]) return SOURCE_TO_SITE[lower];
  for (const [key, site] of Object.entries(SOURCE_TO_SITE)) {
    if (lower.includes(key)) return site;
  }
  return null;
}

// POST /api/auto-apply/start
// Body: { jobUrl, jobTitle, jobCompany, jobSource, resumeId? }
router.post('/start', async (req, res) => {
  const { jobUrl, jobSource, resumeId, jobId, jobLocation } = req.body;
  const jobTitle = req.body.jobTitle || 'Unknown Position';
  const jobCompany = req.body.jobCompany || 'Unknown Company';

  if (!jobUrl) {
    return res.status(400).json({ error: 'jobUrl is required' });
  }

  try {
    // ─── Get user profile ────────────────────────────────────────────────────
    const { rows: userRows } = await pool.query(
      'SELECT id, email, name, preferences FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const profile = userRows[0];
    const preferences = profile.preferences || {};

    // Pull skills from preferences if stored there
    profile.skills = preferences.skills || [];

    // ─── Find resume ─────────────────────────────────────────────────────────
    let resumeRow;
    if (resumeId) {
      const { rows } = await pool.query(
        'SELECT id, filename FROM user_resumes WHERE id = $1 AND user_id = $2',
        [resumeId, req.user.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Resume not found' });
      resumeRow = rows[0];
    } else {
      // Use primary resume
      const { rows } = await pool.query(
        'SELECT id, filename FROM user_resumes WHERE user_id = $1 AND is_primary = true LIMIT 1',
        [req.user.id]
      );
      if (!rows.length) {
        // Fall back to most recent resume
        const { rows: recent } = await pool.query(
          'SELECT id, filename FROM user_resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [req.user.id]
        );
        if (!recent.length) return res.status(400).json({ error: 'No resume found. Upload a resume first.' });
        resumeRow = recent[0];
      } else {
        resumeRow = rows[0];
      }
    }
    const resumePath = path.join(UPLOAD_DIR, resumeRow.filename);

    // ─── Find credentials ─────────────────────────────────────────────────────
    const site = resolveSite(jobUrl, jobSource);
    let credentials = { email: null, password: null };

    if (site) {
      const { rows: credRows } = await pool.query(
        'SELECT site_email, encrypted_password, iv, auth_tag FROM user_job_credentials WHERE user_id = $1 AND site = $2',
        [req.user.id, site]
      );
      if (credRows.length) {
        const cred = credRows[0];
        credentials = {
          email: cred.site_email,
          password: decrypt(cred.encrypted_password, cred.iv, cred.auth_tag),
        };
      }
    }

    // ─── Start the agent job ──────────────────────────────────────────────────
    const runId = uuidv4();

    // Fire and forget — agent runs in background
    startApplyJob({
      runId,
      jobUrl,
      jobTitle,
      jobCompany,
      jobId:       jobId     || null,
      jobSource:   jobSource || null,
      jobLocation: jobLocation || null,
      profile,
      credentials,
      resumePath,
      site,
    });

    res.json({ runId });
  } catch (err) {
    console.error('[AutoApply POST /start]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auto-apply/stream/:runId
// SSE endpoint — streams log entries the client hasn't seen yet, every 1s
// Sends event: done when status is complete or error
router.get('/stream/:runId', (req, res) => {
  const { runId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.flushHeaders();

  let lastSentIndex = 0;

  function sendPending() {
    const entry = applyJobs.get(runId);
    if (!entry) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
      cleanup();
      return;
    }

    // Send any new log entries
    const newLogs = entry.logs.slice(lastSentIndex);
    for (const log of newLogs) {
      res.write(`data: ${JSON.stringify({ type: 'log', ts: log.ts, msg: log.msg })}\n\n`);
    }
    lastSentIndex += newLogs.length;

    // Check if job is terminal
    if (entry.status === 'complete' || entry.status === 'error') {
      res.write(`event: done\ndata: ${JSON.stringify({ status: entry.status, result: entry.result })}\n\n`);
      cleanup();
    }
  }

  const interval = setInterval(sendPending, 1000);

  function cleanup() {
    clearInterval(interval);
    res.end();
  }

  // Send initial check immediately
  sendPending();

  // Clean up if client disconnects
  req.on('close', cleanup);
  req.on('aborted', cleanup);
});

// Default login pages per supported site
const SITE_LOGIN_URLS = {
  linkedin:    'https://www.linkedin.com/login',
  naukri:      'https://www.naukri.com/nlogin/login',
  indeed:      'https://secure.indeed.com/auth',
  glassdoor:   'https://www.glassdoor.com/profile/login_input.htm',
  monster:     'https://www.monster.com/profile/login',
  shine:       'https://www.shine.com/login',
  foundit:     'https://www.foundit.in/user/login',
  internshala: 'https://internshala.com/login/user',
};

// GET /api/auto-apply/session-status/:site
// Returns whether a saved browser session exists for this user + site
router.get('/session-status/:site', (req, res) => {
  const { site } = req.params;
  res.json({ hasSession: hasSession(req.user.id, site) });
});

// GET /api/auto-apply/create-session/:site
// SSE endpoint — opens a visible browser, waits for the user to log in,
// saves the Playwright storageState, then emits a "done" event.
// Uses ?token= for auth since EventSource can't send headers.
router.get('/create-session/:site', async (req, res) => {
  const { site } = req.params;

  if (!SITE_LOGIN_URLS[site]) {
    return res.status(400).json({ error: `Unknown site: ${site}` });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(msg) {
    res.write(`data: ${JSON.stringify({ msg })}\n\n`);
  }

  try {
    const saved = await createSession({
      userId: req.user.id,
      site,
      loginUrl: SITE_LOGIN_URLS[site],
      onLog: send,
    });
    res.write(`event: done\ndata: ${JSON.stringify({ saved })}\n\n`);
  } catch (err) {
    console.error('[AutoApply create-session]', err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = router;
