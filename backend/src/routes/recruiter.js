const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Middleware: verify recruiter role via DB (JWT payload only has id/email)
router.use(async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'recruiter')
      return res.status(403).json({ error: 'Recruiter access only' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_APP_STATUSES = ['Applied', 'Phone Screen', 'Technical', 'Final Interview', 'Offer', 'Rejected'];

// ── Fit-score algorithm ───────────────────────────────────────────────────────

function parseYoeMin(yoeStr) {
  if (!yoeStr) return 0;
  const s = yoeStr.replace('–', '-').trim();
  if (s.includes('+')) return parseInt(s) || 10;
  const parts = s.split('-');
  return parseInt(parts[0]) || 0;
}

function computeFit(applicant, job) {
  const mandatoryList = (job.mandatory_skills || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const applicantSkills = (applicant.applicant_skills || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const minYoe = parseInt(job.min_experience_years) || 0;
  const applicantYoeMin = parseYoeMin(applicant.experience_years);

  // 1. Mandatory skills match (0–100)
  let mandatoryScore = 100;
  if (mandatoryList.length > 0) {
    const matched = mandatoryList.filter(req =>
      applicantSkills.some(as => as.includes(req) || req.includes(as))
    ).length;
    mandatoryScore = Math.round((matched / mandatoryList.length) * 100);
  }

  // 2. Years of experience (0–100)
  let yoeScore = 100;
  if (minYoe > 0) {
    const gap = minYoe - applicantYoeMin;
    if (gap <= 0) yoeScore = 100;
    else if (gap <= 1) yoeScore = 65;
    else if (gap <= 2) yoeScore = 30;
    else yoeScore = 0;
  }

  // 3. Overall skill-match score from apply-time calculation (0–100)
  const overallScore = applicant.skill_match_score || 0;

  // Weighted composite
  const hasMandatory = mandatoryList.length > 0;
  const hasYoe = minYoe > 0;
  let fitScore;
  if (hasMandatory && hasYoe) {
    fitScore = mandatoryScore * 0.50 + yoeScore * 0.30 + overallScore * 0.20;
  } else if (hasMandatory) {
    fitScore = mandatoryScore * 0.60 + overallScore * 0.40;
  } else if (hasYoe) {
    fitScore = yoeScore * 0.40 + overallScore * 0.60;
  } else {
    fitScore = overallScore;
  }
  fitScore = Math.round(fitScore);

  let fitCategory;
  if (fitScore >= 80) fitCategory = 'Best Fit';
  else if (fitScore >= 60) fitCategory = 'Good Fit';
  else if (fitScore >= 35) fitCategory = 'Average Fit';
  else fitCategory = 'Not Fit';

  // Mandatory skill breakdown (which are matched vs missing)
  const matchedMandatory = mandatoryList.filter(req =>
    applicantSkills.some(as => as.includes(req) || req.includes(as))
  );
  const missingMandatory = mandatoryList.filter(req =>
    !applicantSkills.some(as => as.includes(req) || req.includes(as))
  );

  return { fitScore, fitCategory, matchedMandatory, missingMandatory };
}

const RECRUITER_TO_TRACKER = {
  'Applied':        'applied',
  'Phone Screen':   'phone_screen',
  'Technical':      'technical',
  'Final Interview':'final_interview',
  'Offer':          'offer',
  'Rejected':       'rejected',
};

// GET /api/recruiter/jobs — list my posted jobs
router.get('/jobs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.*,
              (SELECT COUNT(*)::int FROM job_applications ja WHERE ja.job_id = j.id) AS applicant_count
       FROM jobhunter_jobs j
       WHERE j.recruiter_id = $1
       ORDER BY j.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recruiter/jobs — post a new job
router.post('/jobs', async (req, res) => {
  const {
    title, description, location,
    job_type, jobType,
    experience_level, experienceLevel,
    skills, salary, custom_questions,
    budget, mandatory_skills, min_experience_years,
  } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const finalJobType  = job_type  ?? jobType  ?? 'Full-time';
  const finalExpLevel = experience_level ?? experienceLevel ?? 'Mid-level';
  const finalQuestions = Array.isArray(custom_questions) ? custom_questions : [];
  const finalMinYoe = parseInt(min_experience_years) || 0;

  try {
    const { rows } = await pool.query(
      `INSERT INTO jobhunter_jobs
         (recruiter_id, title, description, location, job_type, experience_level,
          skills, salary, custom_questions, budget, mandatory_skills, min_experience_years)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.id, title.trim(), description ?? '', location ?? 'Remote',
       finalJobType, finalExpLevel, skills ?? '', salary ?? null,
       JSON.stringify(finalQuestions),
       budget ?? null, mandatory_skills ?? '', finalMinYoe]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recruiter/jobs/:id — update a job
router.patch('/jobs/:id', async (req, res) => {
  const {
    title, description, location, jobType, experienceLevel,
    skills, salary, isActive, customQuestions, custom_questions,
    budget, mandatory_skills, min_experience_years,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE jobhunter_jobs
       SET title                = COALESCE($1, title),
           description          = COALESCE($2, description),
           location             = COALESCE($3, location),
           job_type             = COALESCE($4, job_type),
           experience_level     = COALESCE($5, experience_level),
           skills               = COALESCE($6, skills),
           salary               = COALESCE($7, salary),
           is_active            = COALESCE($8, is_active),
           custom_questions     = COALESCE($11, custom_questions),
           budget               = COALESCE($12, budget),
           mandatory_skills     = COALESCE($13, mandatory_skills),
           min_experience_years = COALESCE($14, min_experience_years),
           updated_at           = NOW()
       WHERE id = $9 AND recruiter_id = $10
       RETURNING *`,
      [title ?? null, description ?? null, location ?? null, jobType ?? null,
       experienceLevel ?? null, skills ?? null, salary ?? null,
       isActive ?? null, req.params.id, req.user.id,
       customQuestions ?? custom_questions ?? null,
       budget ?? null, mandatory_skills ?? null,
       min_experience_years !== undefined ? parseInt(min_experience_years) : null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    if (isActive === false) {
      // Save current status before overwriting so reactivation can restore it.
      // Skip 'offer' (already accepted) and entries already rejected by the
      // recruiter before this deactivation (pre_deactivation_status IS NOT NULL
      // means a prior deactivation already saved the snapshot — don't overwrite it).
      await pool.query(
        `UPDATE applications
         SET pre_deactivation_status = status,
             status     = 'rejected',
             updated_at = NOW()
         WHERE job_id = $1
           AND status != 'offer'
           AND pre_deactivation_status IS NULL`,
        [`jh-${req.params.id}`]
      );
    } else if (isActive === true) {
      // Restore previous statuses for applications that were bulk-rejected on
      // deactivation. Applications genuinely rejected by the recruiter before
      // deactivation will have pre_deactivation_status = NULL and are untouched.
      await pool.query(
        `UPDATE applications
         SET status = pre_deactivation_status,
             pre_deactivation_status = NULL,
             updated_at = NOW()
         WHERE job_id = $1
           AND pre_deactivation_status IS NOT NULL`,
        [`jh-${req.params.id}`]
      );
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recruiter/jobs/:id
router.delete('/jobs/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM jobhunter_jobs WHERE id = $1 AND recruiter_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recruiter/jobs/:id/applicants — view applicants with fit scores
router.get('/jobs/:id/applicants', async (req, res) => {
  try {
    // Verify the job belongs to this recruiter and fetch recruiter-only fields
    const { rows: jobRows } = await pool.query(
      'SELECT id, mandatory_skills, min_experience_years FROM jobhunter_jobs WHERE id = $1 AND recruiter_id = $2',
      [req.params.id, req.user.id]
    );
    if (!jobRows[0]) return res.status(404).json({ error: 'Not found' });
    const jobMeta = jobRows[0];

    const { rows } = await pool.query(
      `SELECT ja.id, ja.job_id, ja.user_id, ja.cover_letter, ja.status, ja.applied_at, ja.updated_at,
              ja.phone, ja.linkedin_url, ja.portfolio_url, ja.applicant_role, ja.experience_years,
              ja.expected_salary, ja.notice_period, ja.applicant_skills, ja.recruiter_notes,
              ja.skill_match_score, ja.resume_id, ja.custom_answers,
              ur.original_name AS resume_original_name,
              u.name AS applicant_name, u.email AS applicant_email
       FROM job_applications ja
       JOIN users u ON u.id = ja.user_id
       LEFT JOIN user_resumes ur ON ur.id = ja.resume_id
       WHERE ja.job_id = $1
       ORDER BY ja.applied_at DESC`,
      [req.params.id]
    );

    // Compute fit score and category for each applicant
    const enriched = rows.map(applicant => {
      const { fitScore, fitCategory, matchedMandatory, missingMandatory } = computeFit(applicant, jobMeta);
      return { ...applicant, fit_score: fitScore, fit_category: fitCategory, matched_mandatory: matchedMandatory, missing_mandatory: missingMandatory };
    });

    // Sort by fit score desc, then applied_at desc
    enriched.sort((a, b) => b.fit_score - a.fit_score || new Date(b.applied_at) - new Date(a.applied_at));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recruiter/jobs/:jobId/applicants/:userId — update applicant status and/or recruiter notes
router.patch('/jobs/:jobId/applicants/:userId', async (req, res) => {
  const { status, recruiterNotes } = req.body;

  if (status !== undefined && !VALID_APP_STATUSES.includes(status))
    return res.status(400).json({ error: `Invalid status. Valid: ${VALID_APP_STATUSES.join(', ')}` });

  try {
    // Verify the job belongs to this recruiter
    const { rows: job } = await pool.query(
      'SELECT id FROM jobhunter_jobs WHERE id = $1 AND recruiter_id = $2',
      [req.params.jobId, req.user.id]
    );
    if (!job[0]) return res.status(404).json({ error: 'Not found' });

    const { rows } = await pool.query(
      `UPDATE job_applications
       SET status         = COALESCE($1, status),
           recruiter_notes = COALESCE($2, recruiter_notes),
           updated_at     = NOW()
       WHERE job_id = $3 AND user_id = $4
       RETURNING *`,
      [status ?? null, recruiterNotes ?? null, req.params.jobId, req.params.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Application not found' });

    // Mirror status into the user's applications tracker table
    if (status) {
      const trackerStatus = RECRUITER_TO_TRACKER[status];
      if (trackerStatus) {
        await pool.query(
          `UPDATE applications SET status = $1, updated_at = NOW()
           WHERE user_id = $2 AND job_id = $3`,
          [trackerStatus, req.params.userId, `jh-${req.params.jobId}`]
        );
      }
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
