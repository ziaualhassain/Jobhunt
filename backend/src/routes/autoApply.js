'use strict';

const express = require('express');
const { randomUUID: uuidv4 } = require('crypto');
const path = require('path');

const requireAuth = require('../middleware/auth');
const { pool, UPLOAD_DIR } = require('../db/database');
const { decrypt } = require('../services/encrypt');
const { startApplyJob, applyJobs } = require('../services/autoApply');

const router = express.Router();
router.use(requireAuth);

// Map job source names → credential site names
const SOURCE_TO_SITE = {
  linkedin: 'linkedin',
  naukri: 'naukri',
  indeed: 'indeed',
  glassdoor: 'glassdoor',
  monster: 'monster',
  shine: 'shine',
  foundit: 'foundit',
  internshala: 'internshala',
};

function jobSourceToSite(jobSource) {
  if (!jobSource) return null;
  const lower = jobSource.toLowerCase();
  // Try direct mapping first
  if (SOURCE_TO_SITE[lower]) return SOURCE_TO_SITE[lower];
  // Try partial match
  for (const [key, site] of Object.entries(SOURCE_TO_SITE)) {
    if (lower.includes(key)) return site;
  }
  return lower; // Fall back to lowercased source as site name
}

// POST /api/auto-apply/start
// Body: { jobUrl, jobTitle, jobCompany, jobSource, resumeId? }
router.post('/start', async (req, res) => {
  const { jobUrl, jobTitle, jobCompany, jobSource, resumeId } = req.body;

  if (!jobUrl || !jobTitle || !jobCompany) {
    return res.status(400).json({ error: 'jobUrl, jobTitle, and jobCompany are required' });
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
    const site = jobSourceToSite(jobSource);
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
      profile,
      credentials,
      resumePath,
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

module.exports = router;
