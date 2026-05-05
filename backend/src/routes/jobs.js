const express = require('express');
const router = express.Router();
const { aggregateJobs } = require('../services/jobSources');
const { pool } = require('../db/database');

// Query TheirStack jobs stored in the DB
async function getTheirStackJobs(filters) {
  const { keywords = [], tags = [], location = '', experienceLevel = '', jobType = '' } = filters;

  const conditions = [];
  const params = [];

  if (keywords.length > 0) {
    const kwConditions = keywords.map(k => {
      params.push(`%${k.toLowerCase()}%`);
      const i = params.length;
      return `(LOWER(title) LIKE $${i} OR LOWER(company) LIKE $${i} OR LOWER(tags) LIKE $${i} OR LOWER(description) LIKE $${i} OR LOWER(location) LIKE $${i})`;
    });
    conditions.push(`(${kwConditions.join(' OR ')})`);
  }

  if (tags.length > 0) {
    const tagConditions = tags.map(t => {
      params.push(`%${t.toLowerCase()}%`);
      return `LOWER(tags) LIKE $${params.length}`;
    });
    conditions.push(`(${tagConditions.join(' OR ')})`);
  }

  if (location) {
    params.push(`%${location.toLowerCase()}%`);
    conditions.push(`LOWER(location) LIKE $${params.length}`);
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
      job_id: row.job_id,
      title: row.title,
      company: row.company,
      location: row.location || 'India',
      url: row.url,
      description: row.description,
      salary: row.salary,
      job_type: row.job_type,
      source: 'TheirStack',
      tags: row.tags,
      logo: row.logo,
    }));
  } catch (err) {
    console.error('[TheirStack DB] query failed:', err.message);
    return [];
  }
}

// GET /api/jobs/search?keywords=aws,kubernetes&jobType=full-time&remote=true
router.get('/search', async (req, res) => {
  try {
    const {
      keywords = '',
      tags = '',
      location = '',
      jobType = '',
      experienceLevel = '',
      remote = 'true',
    } = req.query;

    const filters = {
      keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      location,
      jobType,
      experienceLevel,
      remote: remote === 'true',
    };

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

module.exports = router;
