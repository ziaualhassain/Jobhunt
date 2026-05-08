const express = require('express');
const router = express.Router();
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

    // Live sources (RemoteOK, WWR, Himalayas, ArbeitNow) only carry Remote jobs.
    // Skip calling them entirely when the user wants a specific non-Remote region —
    // they would return nothing useful and waste 4 HTTP calls.
    const skipLive = region && region !== 'Remote';

    const [liveJobs, theirStackJobs] = await Promise.all([
      skipLive ? Promise.resolve([]) : aggregateJobs(filters),
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

module.exports = router;
