const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');
const { shouldUseApi } = require('../services/llmProvider');
const { aggregateJobs } = require('../services/jobSources');
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
    }));
  } catch (err) {
    console.error('[TheirStack DB] query failed:', err.message);
    return [];
  }
}

// Career page jobs — user watchlist + default companies (UNIONed, deduplicated)
async function getCareerPageJobs(userId, filters) {
  const { keywords = [], tags = [], region = '' } = filters;
  const allSignals = [...new Set([...keywords, ...tags])].filter(Boolean);

  // Build shared signal/region clauses (applied to both halves of the UNION)
  // We build the param list once and reuse param indices via a helper.
  const params = [userId];  // $1 = userId (used only in the watchlist half)

  function regionClause(alias) {
    if (!region) return null;
    params.push(region);
    return `${alias}.region = $${params.length}`;
  }

  function signalClauses(alias) {
    if (allSignals.length === 0) return null;
    const clauses = allSignals.flatMap(signal => {
      const words = signal.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
      return words.map(w => {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        params.push(`\\m${escaped}\\M`);
        const i = params.length;
        return `(LOWER(${alias}.title) ~* $${i} OR LOWER(${alias}.tags) ~* $${i} OR LOWER(${alias}.description) ~* $${i})`;
      });
    });
    return clauses.length > 0 ? `(${clauses.join(' OR ')})` : null;
  }

  // ── Watchlist half ────────────────────────────────────────────────────────
  const watchConditions = ['wc.user_id = $1', 'wc.is_active = true'];
  const rc1 = regionClause('cpj');
  if (rc1) watchConditions.push(rc1);
  const sc1 = signalClauses('cpj');
  if (sc1) watchConditions.push(sc1);

  // ── Default companies half ────────────────────────────────────────────────
  const defaultConditions = [];
  const rc2 = regionClause('dc');
  if (rc2) defaultConditions.push(rc2);
  const sc2 = signalClauses('dc');
  if (sc2) defaultConditions.push(sc2);

  const defaultWhere = defaultConditions.length > 0
    ? `WHERE ${defaultConditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT cpj.job_id, cpj.company_name, cpj.location, cpj.region, cpj.url,
           cpj.description, cpj.job_type, cpj.tags, cpj.title, cpj.scraped_at
    FROM careers cpj
    JOIN watched_companies wc ON wc.career_url = cpj.career_url
    WHERE ${watchConditions.join(' AND ')}

    UNION

    SELECT dc.job_id, dc.company_name, dc.location, dc.region, dc.url,
           dc.description, dc.job_type, dc.tags, dc.title, dc.scraped_at
    FROM careers dc
    JOIN default_career_pages dcp ON dcp.career_url = dc.career_url
    ${defaultWhere}

    ORDER BY scraped_at DESC NULLS LAST
    LIMIT 200
  `;

  try {
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({
      job_id:      r.job_id,
      title:       r.title,
      company:     r.company_name,
      location:    r.location || 'Not specified',
      region:      r.region || '',
      url:         r.url,
      description: r.description || '',
      salary:      '',
      job_type:    r.job_type || 'Full-time',
      source:      'Company Watch',
      tags:        r.tags || '',
      logo:        '',
    }));
  } catch (err) {
    console.error('[CareerPageJobs] query failed:', err.message);
    return [];
  }
}

// Default career page jobs — available to all users (no auth required)
async function getDefaultCareerJobs(filters) {
  const { keywords = [], tags = [], region = '' } = filters;
  const allSignals = [...new Set([...keywords, ...tags])].filter(Boolean);

  const conditions = [];
  const params = [];

  if (region) {
    params.push(region);
    conditions.push(`dc.region = $${params.length}`);
  }

  if (allSignals.length > 0) {
    const signalClauses = allSignals.flatMap(signal => {
      const words = signal.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
      return words.map(w => {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        params.push(`\\m${escaped}\\M`);
        const i = params.length;
        return `(LOWER(dc.title) ~* $${i} OR LOWER(dc.tags) ~* $${i} OR LOWER(dc.description) ~* $${i})`;
      });
    });
    if (signalClauses.length > 0) conditions.push(`(${signalClauses.join(' OR ')})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT dc.job_id, dc.company_name, dc.location, dc.region, dc.url,
           dc.description, dc.job_type, dc.tags, dc.title, dc.scraped_at
    FROM careers dc
    JOIN default_career_pages dcp ON dcp.career_url = dc.career_url
    ${where}
    ORDER BY dc.scraped_at DESC NULLS LAST
    LIMIT 200
  `;

  try {
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({
      job_id:      r.job_id,
      title:       r.title,
      company:     r.company_name,
      location:    r.location || 'Not specified',
      region:      r.region || '',
      url:         r.url,
      description: r.description || '',
      salary:      '',
      job_type:    r.job_type || 'Full-time',
      source:      'Company Watch',
      tags:        r.tags || '',
      logo:        '',
    }));
  } catch (err) {
    console.error('[DefaultCareerJobs] query failed:', err.message);
    return [];
  }
}

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
function rankJobs(jobs, filters) {
  const { keywords = [], tags = [] } = filters;
  const signals = [...new Set([...keywords, ...tags])]
    .filter(Boolean)
    .flatMap(s =>
      s.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w))
    );

  // Pre-compile word-boundary regexes once per signal
  const signalRegexes = signals.map(w => ({
    w,
    re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

  return jobs
    .map(job => {
      let score = 0;
      const title   = job.title       || '';
      const jobTags = job.tags        || '';
      const desc    = job.description || '';

      let signalsMatched = 0;
      for (const { re } of signalRegexes) {
        const inTitle = re.test(title);
        const inTags  = re.test(jobTags);
        const inDesc  = re.test(desc);
        if (inTitle || inTags || inDesc) signalsMatched++;
        if (inTitle) score += 40;
        if (inTags)  score += 25;
        if (inDesc)  score += 5;
      }

      // Coverage multiplier: matching more of the searched terms is exponentially better.
      // e.g. 4/4 signals → ×2.0, 3/4 → ×1.5, 2/4 → ×1.2, 1/4 → ×1.0
      if (signals.length > 0) {
        const coverage = signalsMatched / signals.length;
        score = Math.round(score * (1 + coverage));
      }

      // Completeness bonuses (source-neutral)
      const tagCount = jobTags ? jobTags.split(',').filter(t => t.trim()).length : 0;
      score += Math.min(tagCount * 4, 40);
      if (job.salary)       score += 15;
      if (desc.length > 100) score += 10;

      return { ...job, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .map(({ _score, ...job }) => job);
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

    const [liveJobs, theirStackJobs, careerJobs] = await Promise.all([
      aggregateJobs(filters),
      getTheirStackJobs(filters),
      req.user ? getCareerPageJobs(req.user.id, filters) : getDefaultCareerJobs(filters),
    ]);

    // Deduplicate by job_id across all sources
    const seen = new Set();
    const merged = [];
    for (const job of [...liveJobs, ...theirStackJobs, ...careerJobs]) {
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

module.exports = router;
