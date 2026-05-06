const express = require('express');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');
const { generatePlan, parseUpload } = require('../services/prepCoach');

router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── helpers ──────────────────────────────────────────────────────────────────

function calcStreak(checkinDates) {
  if (!checkinDates.length) return { current: 0, longest: 0 };
  const sorted = [...checkinDates].sort((a, b) => new Date(b) - new Date(a));
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  let current = 0;
  let cursor = new Date(sorted[0]); cursor.setHours(0,0,0,0);
  if (cursor.getTime() !== today.getTime() && cursor.getTime() !== yesterday.getTime()) {
    current = 0;
  } else {
    current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i]); prev.setHours(0,0,0,0);
      const expected = new Date(cursor); expected.setDate(cursor.getDate() - 1);
      if (prev.getTime() === expected.getTime()) { current++; cursor = prev; }
      else break;
    }
  }

  let longest = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i-1]); a.setHours(0,0,0,0);
    const b = new Date(sorted[i]); b.setHours(0,0,0,0);
    const diff = (a - b) / 86400000;
    if (Math.round(diff) === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }

  return { current, longest };
}

// ── plans ─────────────────────────────────────────────────────────────────────

router.get('/plans', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.completed) ::int AS completed_tasks
       FROM prep_plans p
       LEFT JOIN prep_tasks t ON t.plan_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id ORDER BY p.updated_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/plans/:id', async (req, res) => {
  try {
    const { rows: [plan] } = await pool.query(
      'SELECT * FROM prep_plans WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id],
    );
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const { rows: tasks } = await pool.query(
      'SELECT * FROM prep_tasks WHERE plan_id=$1 ORDER BY category, priority DESC, created_at',
      [plan.id],
    );
    const { rows: checkins } = await pool.query(
      'SELECT checkin_date FROM prep_checkins WHERE plan_id=$1 AND user_id=$2 ORDER BY checkin_date DESC',
      [plan.id, req.user.id],
    );
    const streak = calcStreak(checkins.map(c => c.checkin_date));
    const todayCheckin = checkins[0]
      ? new Date(checkins[0].checkin_date).toDateString() === new Date().toDateString()
      : false;

    res.json({ ...plan, tasks, checkins: checkins.map(c => c.checkin_date), streak, todayCheckin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/prep/plans/generate  (AI)
router.post('/plans/generate', async (req, res) => {
  const { role, company = '', timelineWeeks = 8, focusAreas = '' } = req.body;
  if (!role) return res.status(400).json({ error: 'role is required' });
  try {
    let aiPlan;
    try {
      aiPlan = await generatePlan(role, company, timelineWeeks, focusAreas);
    } catch (e) {
      if (e.message === 'NO_BACKEND') return res.status(503).json({ error: 'No AI backend. Install Ollama or set ANTHROPIC_API_KEY.' });
      throw e;
    }

    const title = aiPlan.title || `${timelineWeeks}-Week ${role} Prep`;
    const { rows: [plan] } = await pool.query(
      `INSERT INTO prep_plans (user_id,title,goal,company,role,timeline_weeks,source)
       VALUES ($1,$2,$3,$4,$5,$6,'ai') RETURNING *`,
      [req.user.id, title, aiPlan.goal || '', company, role, timelineWeeks],
    );

    for (const cat of (aiPlan.categories || [])) {
      for (const task of (cat.tasks || [])) {
        await pool.query(
          `INSERT INTO prep_tasks (plan_id,category,title,description,estimated_hours,resources,priority)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [plan.id, cat.name || 'General', task.title, task.description || '',
           task.estimated_hours || 1, task.resources || '', task.priority || 'medium'],
        );
      }
    }
    res.status(201).json({ id: plan.id, title: plan.title });
  } catch (err) {
    console.error('[Prep generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prep/plans/upload  (file)
router.post('/plans/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { planTitle = 'Uploaded Plan', role = '', company = '' } = req.body;
  try {
    const tasks = await parseUpload(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!tasks.length) return res.status(422).json({ error: 'No tasks could be extracted from the file' });

    const { rows: [plan] } = await pool.query(
      `INSERT INTO prep_plans (user_id,title,goal,company,role,timeline_weeks,source)
       VALUES ($1,$2,'','','',8,'upload') RETURNING *`,
      [req.user.id, planTitle || req.file.originalname],
    );
    for (const t of tasks) {
      await pool.query(
        `INSERT INTO prep_tasks (plan_id,category,title,description,estimated_hours,resources,priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [plan.id, t.category, t.title, t.description, t.estimated_hours, t.resources, t.priority],
      );
    }
    res.status(201).json({ id: plan.id, title: plan.title, taskCount: tasks.length });
  } catch (err) {
    console.error('[Prep upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/plans/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM prep_plans WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id],
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── tasks ─────────────────────────────────────────────────────────────────────

router.patch('/tasks/:id', async (req, res) => {
  try {
    const { completed } = req.body;
    // verify ownership
    const { rows: [task] } = await pool.query(
      `SELECT t.* FROM prep_tasks t
       JOIN prep_plans p ON p.id = t.plan_id
       WHERE t.id=$1 AND p.user_id=$2`,
      [req.params.id, req.user.id],
    );
    if (!task) return res.status(404).json({ error: 'Not found' });

    const { rows: [updated] } = await pool.query(
      `UPDATE prep_tasks SET completed=$1, completed_at=$2 WHERE id=$3 RETURNING *`,
      [completed, completed ? new Date().toISOString() : null, req.params.id],
    );
    await pool.query('UPDATE prep_plans SET updated_at=NOW() WHERE id=$1', [task.plan_id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── check-ins ─────────────────────────────────────────────────────────────────

router.post('/plans/:id/checkin', async (req, res) => {
  try {
    const { rows: [plan] } = await pool.query(
      'SELECT id FROM prep_plans WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id],
    );
    if (!plan) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      `INSERT INTO prep_checkins (user_id, plan_id, checkin_date)
       VALUES ($1,$2,CURRENT_DATE)
       ON CONFLICT (user_id, plan_id, checkin_date) DO NOTHING`,
      [req.user.id, plan.id],
    );

    const { rows: checkins } = await pool.query(
      'SELECT checkin_date FROM prep_checkins WHERE plan_id=$1 AND user_id=$2 ORDER BY checkin_date DESC',
      [plan.id, req.user.id],
    );
    const streak = calcStreak(checkins.map(c => c.checkin_date));
    res.json({ streak, todayCheckin: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
