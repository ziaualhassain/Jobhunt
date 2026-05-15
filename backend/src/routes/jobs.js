const express = require('express');
const router = express.Router();
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { shouldUseApi } = require('../services/llmProvider');
const { aggregateJobs } = require('../services/jobSources');
const { pool } = require('../db/database');

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
  const { keywords = [], tags = [], location = '', experienceLevel = '', jobType = '', remote = true, region = '' } = filters;

  const conditions = [];
  const params = [];

  // Region filter — exact match on the stored region column
  if (region) {
    params.push(region);
    conditions.push(`region = $${params.length}`);
  }

  if (keywords.length > 0) {
    const kwConditions = keywords.flatMap(kw => {
      const words = kw.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
      if (words.length === 0) return [];
      const wordClauses = words.map(w => {
        params.push(`%${w}%`);
        const i = params.length;
        return `(LOWER(title) LIKE $${i} OR LOWER(company) LIKE $${i} OR LOWER(tags) LIKE $${i} OR LOWER(description) LIKE $${i} OR LOWER(location) LIKE $${i})`;
      });
      return [`(${wordClauses.join(' OR ')})`];
    });
    if (kwConditions.length > 0) conditions.push(`(${kwConditions.join(' OR ')})`);
  }

  if (tags.length > 0) {
    const tagConditions = tags.map(t => {
      params.push(`%${t.toLowerCase()}%`);
      return `LOWER(tags) LIKE $${params.length}`;
    });
    conditions.push(`(${tagConditions.join(' OR ')})`);
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

  if (experienceLevel) {
    params.push(`%${experienceLevel.toLowerCase()}%`);
    const i = params.length;
    conditions.push(`(LOWER(title) LIKE $${i} OR LOWER(description) LIKE $${i})`);
  }

  if (jobType) {
    params.push(`%${jobType.toLowerCase()}%`);
    conditions.push(`LOWER(job_type) LIKE $${params.length}`);
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

// GET /api/jobs/search
router.get('/search', async (req, res) => {
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

    // Live sources (RemoteOK, WWR, Himalayas, ArbeitNow) carry Remote jobs.
    // Remote jobs are relevant to users in any country, so always include them.
    // Only skip live sources when the user explicitly wants Remote-only AND has
    // no other filters — not a scenario that helps here.
    const [liveJobs, theirStackJobs] = await Promise.all([
      aggregateJobs(filters),
      getTheirStackJobs(filters),
    ]);

    // Merge and deduplicate by job_id
    const seen = new Set();
    const jobs = [];
    for (const job of [...liveJobs, ...theirStackJobs]) {
      if (!seen.has(job.job_id)) {
        seen.add(job.job_id);
        jobs.push(job);
      }
    }

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
