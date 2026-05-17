const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');
const { aggregateJobs } = require('../services/jobSources');

function shouldUseApi() {
  return !!(process.env.USE_API === 'true' && process.env.ANTHROPIC_API_KEY);
}
const { pool } = require('../db/database');

// Decodes the JWT if present but never blocks the request (for public endpoints)
function optionalAuth(req, _res, next) {
  try {
    const auth = req.headers.authorization;
    const raw = auth?.startsWith('Bearer ') ? auth.slice(7) : (req.query.token ?? null);
    if (raw) req.user = jwt.verify(raw, process.env.JWT_SECRET);
  } catch { /* ignore invalid tokens */ }
  next();
}

const STOP_WORDS = new Set([
  'solutions', 'technologies', 'technology', 'methodologies', 'methodology',
  'architecture', 'architectures', 'design', 'driven', 'native', 'based',
  'development', 'engineering', 'management', 'practices', 'principles',
  'concepts', 'patterns', 'strategy', 'strategies', 'framework', 'frameworks',
  'developer', 'engineer', 'specialist', 'professional',
  'and', 'for', 'the', 'with', 'using',
]);

// Query TheirStack jobs stored in the DB
async function getTheirStackJobs(filters) {
  const { keywords = [], tags = [], location = '', remote = true, region = '' } = filters;

  const conditions = [];
  const params = [];

  // Region filter — exact match on the stored region column
  if (region) {
    params.push(region);
    conditions.push(`region = $${params.length}`);
  }

  // Unified relevance: keywords OR tags — any signal match qualifies the row.
  // Uses PostgreSQL word-boundary regex (~*) so 'java' doesn't match 'javascript'.
  const allSignals = [...new Set([...keywords, ...tags])].filter(Boolean);
  if (allSignals.length > 0) {
    const signalClauses = allSignals.flatMap(signal => {
      const words = signal.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
      if (words.length === 0) return [];
      return words.map(w => {
        // Escape regex special chars in the word
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        params.push(`\\m${escaped}\\M`);  // \m = word start, \M = word end in PG regex
        const i = params.length;
        return `(LOWER(title) ~* $${i} OR LOWER(company) ~* $${i} OR LOWER(tags) ~* $${i} OR LOWER(description) ~* $${i})`;
      });
    });
    if (signalClauses.length > 0) conditions.push(`(${signalClauses.join(' OR ')})`);
  }

  if (location) {
    const loc = location.toLowerCase();
    params.push(`%${loc}%`);
    if (remote) {
      conditions.push(`(LOWER(location) LIKE $${params.length} OR LOWER(location) LIKE '%remote%' OR LOWER(location) LIKE '%anywhere%')`);
    } else {
      conditions.push(`(LOWER(location) LIKE $${params.length} AND LOWER(location) NOT LIKE '%remote%' AND LOWER(location) NOT LIKE '%anywhere%')`);
    }
  }

  let sql = 'SELECT * FROM theirstack_jobs';
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY date_posted DESC NULLS LAST LIMIT 200';

  try {
    const { rows } = await pool.query(sql, params);
    return rows.map(row => ({
      job_id:      row.job_id,
      title:       row.title,
      company:     row.company,
      location:    row.location || row.region || 'India',
      region:      row.region   || 'India',
      url:         row.url,
      description: row.description,
      salary:      row.salary,
      job_type:    row.job_type,
      source:      'TheirStack',
      tags:        row.tags,
      logo:        row.logo,
      date_posted: row.date_posted ? new Date(row.date_posted).toISOString() : null,
    }));
  } catch (err) {
    console.error('[TheirStack DB] query failed:', err.message);
    return [];
  }
}

// Career page feature not on this branch — stubs so search still works
async function getCareerPageJobs(_userId, _filters) { return []; }
async function getDefaultCareerJobs(_filters) { return []; }

// ── Job ranking ──────────────────────────────────────────────────────────────
// Scores every job and sorts across all sources so results are interleaved
// by relevance instead of grouped by source.
//
// Signal weights:
//   Title match   +40  (most intent-bearing field)
//   Tag match     +25  (curated skills — high signal)
//   Desc match    +5   (broad text — lower weight)
//   Tag count     +4 each, capped at 40  (richer data = more useful)
//   Has salary    +15
//   Has desc      +10
//
// When no search query is present (browsing) the score is purely based on
// data completeness so richer jobs still surface ahead of stub entries.
// ── Experience helpers ────────────────────────────────────────────────────────

const BACKEND_LEVEL_MAP = {
  Junior: 1, 'Mid-level': 2, Senior: 3, Lead: 4, Staff: 5, Principal: 6,
};

function parseRequiredYears(text) {
  const t = (text || '').toLowerCase();
  const patterns = [
    /\bat\s+least\s+(\d+)\s+years?/,
    /\bminimum\s+(?:of\s+)?(\d+)\s+years?/,
    /(\d+)\s*\+\s*years?\s+(?:of\s+)?(?:experience|exp)/,
    /(\d+)\s*\+\s*years?/,
    /(\d+)\s*[-–]\s*\d+\s*years?\s+(?:of\s+)?(?:experience|exp)/,
    /(\d+)\s*[-–]\s*\d+\s*years?/,
    /(\d+)\s+years?\s+(?:of\s+)?(?:professional\s+)?(?:experience|exp)/,
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function detectBackendJobLevel(title, desc) {
  const t = `${title} ${desc}`.toLowerCase();
  if (/\b(principal|distinguished|fellow)\b/.test(t))                               return 6;
  if (/\bstaff\s+(engineer|developer|dev)\b/.test(t))                               return 5;
  if (/\b(tech\s*lead|lead\s+(engineer|developer|dev)|engineering\s+lead)\b/.test(t)) return 4;
  if (/\bsenior\b/.test(t))                                                         return 3;
  if (/\b(mid[- ]level|intermediate)\b/.test(t))                                    return 2;
  if (/\b(junior|entry[- ]level|graduate|intern)\b/.test(t))                        return 1;
  const yrs = parseRequiredYears(desc);
  if (yrs !== null) {
    if (yrs >= 10) return 6;
    if (yrs >= 7)  return 5;
    if (yrs >= 5)  return 4;
    if (yrs >= 3)  return 3;
    if (yrs >= 1)  return 2;
    return 1;
  }
  return 2;  // default: mid-level (unlabelled jobs skew mid)
}

function rankJobs(jobs, filters) {
  const { keywords = [], tags = [], experienceLevel = '' } = filters;
  const rawSignals = [...new Set([...keywords, ...tags])].filter(Boolean);

  // Single-word tokens for word-boundary matching
  const signals = rawSignals.flatMap(s =>
    s.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );

  // Multi-word phrases get a separate phrase-match bonus
  const phrases = rawSignals.filter(s => s.split(/\s+/).length > 1);

  const signalRegexes = signals.map(w =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  );
  const phraseRegexes = phrases.map(p =>
    new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  );

  const filterLevel = BACKEND_LEVEL_MAP[experienceLevel] ?? null;
  const now = Date.now();

  return jobs
    .map(job => {
      let score = 0;
      const title   = job.title       || '';
      const jobTags = job.tags        || '';
      const desc    = job.description || '';

      // ── Keyword relevance ─────────────────────────────────────────────────
      // Title weight raised 40→60: it's the single most intent-bearing field.
      let signalsMatched = 0;
      for (const re of signalRegexes) {
        const inTitle = re.test(title);
        const inTags  = re.test(jobTags);
        const inDesc  = re.test(desc);
        if (inTitle || inTags || inDesc) signalsMatched++;
        if (inTitle) score += 60;
        if (inTags)  score += 30;
        if (inDesc)  score += 8;
      }

      // Coverage multiplier: all signals matched → ×2.0, partial → proportional
      if (signals.length > 0) {
        score = Math.round(score * (1 + signalsMatched / signals.length));
      }

      // Phrase match bonus — "machine learning" as phrase > individual words
      for (const re of phraseRegexes) {
        if (re.test(title))   score += 35;
        else if (re.test(jobTags)) score += 20;
        else if (re.test(desc))    score += 6;
      }

      // ── Experience level scoring ──────────────────────────────────────────
      // Bonus for perfect/near match; exponential penalty for large gaps.
      if (filterLevel !== null) {
        const jobLevel = detectBackendJobLevel(title, desc);
        const diff = Math.abs(jobLevel - filterLevel);
        if (diff === 0)      score += 35;  // perfect match
        else if (diff === 1) score += 10;  // one level off: acceptable
        else                 score -= diff * 30; // 2+ levels: escalating penalty
      }

      // ── Recency bonus ─────────────────────────────────────────────────────
      // Newer jobs rank higher — shows candidate the freshest opportunities first.
      const dateStr = job.date_posted || job.scraped_at;
      if (dateStr) {
        const daysOld = (now - new Date(dateStr).getTime()) / 86_400_000;
        if (daysOld <= 2)       score += 40;
        else if (daysOld <= 7)  score += 25;
        else if (daysOld <= 14) score += 12;
        else if (daysOld <= 30) score += 5;
      }

      // ── Completeness bonuses (source-neutral) ─────────────────────────────
      const tagCount = jobTags ? jobTags.split(',').filter(t => t.trim()).length : 0;
      score += Math.min(tagCount * 4, 40);
      if (job.salary)        score += 15;
      if (desc.length > 100) score += 10;
      if (desc.length > 600) score += 8;  // rich description

      return { ...job, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .filter(job => {
      if (filterLevel === null) return true;
      const titleLow = (job.title || '').toLowerCase();
      const headLow  = (job.description || '').slice(0, 300).toLowerCase();
      // Junior (≤1): exclude Senior/Lead/Staff/Principal titles
      if (filterLevel <= 1 && /\b(senior|sr\.|lead\s+(engineer|developer|dev)|staff\s+(engineer|developer)|principal|distinguished|fellow)\b/.test(titleLow)) return false;
      // Junior (≤1): also exclude explicitly mid-level / intermediate titles
      if (filterLevel <= 1 && /\b(mid[- ]?level|intermediate)\b/.test(titleLow)) return false;
      // Junior (≤1): exclude jobs requiring 2+ years (parseRequiredYears returns lower bound of ranges)
      if (filterLevel <= 1) {
        const reqYears = parseRequiredYears(job.description || '');
        if (reqYears !== null && reqYears >= 2) return false;
      }
      // Mid-level+ (≥2): exclude explicit intern / trainee / fresher / apprentice
      if (filterLevel >= 2 && /\b(intern(ship)?|trainee|apprentice|fresher)\b/.test(titleLow + ' ' + headLow)) return false;
      return true;
    })
    .slice(0, 100)
    .map(({ _score, ...job }) => job);
}

// JobHunters platform jobs — posted by recruiters on the platform
async function getJobHunterJobs(filters) {
  const { keywords = [], tags = [], region = '' } = filters;
  const allSignals = [...new Set([...keywords, ...tags])].filter(Boolean);
  const params = [];
  const conditions = ['j.is_active = TRUE'];

  if (allSignals.length > 0) {
    const signalClauses = allSignals.flatMap(signal => {
      const words = signal.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
      return words.map(w => {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        params.push(`\\m${escaped}\\M`);
        const i = params.length;
        return `(LOWER(j.title) ~* $${i} OR LOWER(j.skills) ~* $${i} OR LOWER(j.description) ~* $${i})`;
      });
    });
    if (signalClauses.length > 0) conditions.push(`(${signalClauses.join(' OR ')})`);
  }

  try {
    const sql = `
      SELECT j.id, j.title, j.description, j.location, j.job_type, j.experience_level,
             j.skills, j.salary, j.created_at,
             u.name AS company, u.company_name
      FROM jobhunter_jobs j
      JOIN users u ON u.id = j.recruiter_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY j.created_at DESC LIMIT 50
    `;
    const { rows } = await pool.query(sql, params);
    return rows.map(row => ({
      job_id:      `jh-${row.id}`,
      title:       row.title,
      company:     row.company_name || row.company,
      location:    row.location,
      region:      region || 'India',
      url:         null,
      description: row.description,
      salary:      row.salary,
      job_type:    row.job_type,
      source:      'JobHunters',
      tags:        row.skills,
      logo:        null,
      date_posted: row.created_at ? new Date(row.created_at).toISOString() : null,
      // Keep the numeric id so the apply endpoint can use it
      _internal_id: row.id,
    }));
  } catch (err) {
    console.error('[JobHunterJobs] query failed:', err.message);
    return [];
  }
}

// GET /api/jobs/search
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const {
      keywords = '',
      tags = '',
      location = '',
      jobType = '',
      experienceLevel = '',
      remote = 'true',
      region = '',
    } = req.query;

    const filters = {
      keywords:        keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      tags:            tags     ? tags.split(',').map(t => t.trim()).filter(Boolean)     : [],
      location,
      jobType,
      experienceLevel,
      remote:          remote === 'true',
      region,
    };

    const [liveJobs, theirStackJobs, careerJobs, jobHunterJobs] = await Promise.all([
      aggregateJobs(filters),
      getTheirStackJobs(filters),
      req.user ? getCareerPageJobs(req.user.id, filters) : getDefaultCareerJobs(filters),
      getJobHunterJobs(filters),
    ]);

    // Deduplicate by job_id across all sources
    const seen = new Set();
    const merged = [];
    for (const job of [...liveJobs, ...theirStackJobs, ...careerJobs, ...jobHunterJobs]) {
      if (!seen.has(job.job_id)) {
        seen.add(job.job_id);
        merged.push(job);
      }
    }

    // Rank by relevance + completeness so results interleave across sources
    const jobs = rankJobs(merged, filters);

    res.json({ jobs, total: jobs.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// ── POST /api/jobs/deep-score ────────────────────────────────────────────────
// AI-powered resume ↔ JD scoring via Ollama or Claude.
// Body: { analysis: ResumeAnalysis, job: { title, company, description, tags } }

const DEEP_SCORE_SYSTEM = `You are an expert technical recruiter. Given a candidate profile and a job description, score the fit precisely and honestly.
Return ONLY valid JSON — no markdown fences, no extra text.`;

function buildDeepScorePrompt(analysis, job) {
  return `CANDIDATE PROFILE:
Skills: ${analysis.skills?.join(', ') || 'not provided'}
Experience Level: ${analysis.experienceLevel || 'unknown'} (${analysis.yearsOfExperience || '?'} years)
Best-fit roles: ${analysis.jobTitles?.join(', ') || 'not provided'}
Summary: ${analysis.summary || ''}

JOB: ${job.title} at ${job.company || 'Unknown Company'}
Required skills/tags: ${job.tags || 'not listed'}
Description: ${(job.description || '').slice(0, 1200)}

Score this candidate's fit and return ONLY this JSON:
{
  "score": <integer 0-100>,
  "matched_skills": ["skills from candidate that match the JD"],
  "skill_gaps": ["skills the JD needs that the candidate lacks"],
  "seniority_fit": "one sentence on experience level match",
  "reasoning": "2-3 sentence honest assessment of overall fit"
}`;
}

async function deepScoreWithOllama(analysis, job) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const res = await axios.post(`${baseUrl}/api/chat`, {
    model,
    format: 'json',
    stream: false,
    messages: [
      { role: 'system', content: DEEP_SCORE_SYSTEM },
      { role: 'user', content: buildDeepScorePrompt(analysis, job) },
    ],
    options: { temperature: 0.1 },
  }, { timeout: 60_000 });
  const raw = res.data?.message?.content;
  if (!raw) throw new Error('Empty Ollama response');
  return JSON.parse(raw);
}

async function deepScoreWithClaude(analysis, job) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const schema = {
    type: 'object',
    properties: {
      score:          { type: 'number' },
      matched_skills: { type: 'array', items: { type: 'string' } },
      skill_gaps:     { type: 'array', items: { type: 'string' } },
      seniority_fit:  { type: 'string' },
      reasoning:      { type: 'string' },
    },
    required: ['score', 'matched_skills', 'skill_gaps', 'seniority_fit', 'reasoning'],
    additionalProperties: false,
  };
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 512,
    system: [{ type: 'text', text: DEEP_SCORE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildDeepScorePrompt(analysis, job) }],
    output_config: { format: { type: 'json_schema', json_schema: { name: 'deep_score', schema } } },
  });
  const textBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(textBlock.text);
}

router.post('/deep-score', async (req, res) => {
  try {
    const { analysis, job } = req.body;
    if (!analysis || !job) return res.status(400).json({ error: 'analysis and job are required' });

    let result;

    if (shouldUseApi()) {
      result = await deepScoreWithClaude(analysis, job);
    } else {
      try {
        await axios.get(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`, { timeout: 2000 });
        result = await deepScoreWithOllama(analysis, job);
      } catch {
        return res.status(503).json({ error: 'No AI backend available. Set USE_API=true with ANTHROPIC_API_KEY, or run Ollama locally.' });
      }
    }

    res.json(result);
  } catch (err) {
    console.error('[DeepScore]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs/:jobId/apply  (job seeker applies to a JobHunters job) ─────
// jobId is the numeric DB id (NOT the "jh-123" string used on the frontend)
const requireAuth = require('../middleware/auth');

router.post('/:jobId/apply', requireAuth, async (req, res) => {
  // Accept both "123" and "jh-123" formats
  const raw = req.params.jobId.replace(/^jh-/, '');
  const numericId = parseInt(raw, 10);
  if (isNaN(numericId)) return res.status(400).json({ error: 'Invalid job id' });

  const { coverLetter = '' } = req.body;
  try {
    // Confirm job exists and is active
    const { rows: job } = await pool.query(
      'SELECT id FROM jobhunter_jobs WHERE id = $1 AND is_active = TRUE',
      [numericId]
    );
    if (!job[0]) return res.status(404).json({ error: 'Job not found or inactive' });

    const { rows } = await pool.query(
      `INSERT INTO job_applications (job_id, user_id, cover_letter)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id, user_id) DO NOTHING
       RETURNING *`,
      [numericId, req.user.id, coverLetter]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Already applied' });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/my-applications — job seeker: list applied JobHunters job IDs (jh-{id} format)
router.get('/my-applications', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT job_id FROM job_applications WHERE user_id = $1',
      [req.user.id]
    );
    // Return jh-{id} strings matching frontend job_id format
    res.json(rows.map(r => `jh-${r.job_id}`));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
