const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');
const { chat } = require('../services/interviewCoach');

router.use(requireAuth);

// GET /api/interview/sessions
router.get('/sessions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, COUNT(m.id)::int AS message_count
       FROM interview_sessions s
       LEFT JOIN interview_messages m ON m.session_id = s.id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interview/sessions
router.post('/sessions', async (req, res) => {
  const { title, company = '', role = '', mode = 'practice' } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO interview_sessions (user_id, title, company, role, mode)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, title, company, role, mode],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interview/sessions/:id  (with messages)
router.get('/sessions/:id', async (req, res) => {
  try {
    const { rows: [session] } = await pool.query(
      'SELECT * FROM interview_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id],
    );
    if (!session) return res.status(404).json({ error: 'Not found' });

    const { rows: messages } = await pool.query(
      'SELECT * FROM interview_messages WHERE session_id=$1 ORDER BY created_at ASC',
      [session.id],
    );
    res.json({ ...session, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interview/sessions/:id/chat
router.post('/sessions/:id/chat', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

  try {
    const { rows: [session] } = await pool.query(
      'SELECT * FROM interview_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id],
    );
    if (!session) return res.status(404).json({ error: 'Not found' });

    // Fetch conversation history
    const { rows: history } = await pool.query(
      'SELECT role, content FROM interview_messages WHERE session_id=$1 ORDER BY created_at ASC',
      [session.id],
    );

    // Save user message
    await pool.query(
      'INSERT INTO interview_messages (session_id, role, content) VALUES ($1,$2,$3)',
      [session.id, 'user', message.trim()],
    );

    // Call AI with full history + new message
    const aiMessages = [...history, { role: 'user', content: message.trim() }];
    let reply;
    try {
      reply = await chat(aiMessages, session.role, session.company, session.mode);
    } catch (aiErr) {
      if (aiErr.message === 'NO_BACKEND') {
        return res.status(503).json({
          error: 'No AI backend available. Install Ollama (ollama.com) or set ANTHROPIC_API_KEY.',
        });
      }
      throw aiErr;
    }

    // Save assistant message
    const { rows: [saved] } = await pool.query(
      'INSERT INTO interview_messages (session_id, role, content) VALUES ($1,$2,$3) RETURNING *',
      [session.id, 'assistant', reply],
    );

    // Update session timestamp
    await pool.query(
      'UPDATE interview_sessions SET updated_at=NOW() WHERE id=$1',
      [session.id],
    );

    res.json(saved);
  } catch (err) {
    console.error('[Interview chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/interview/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM interview_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
