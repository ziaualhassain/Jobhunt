const express = require('express');
const router = express.Router();
const { aggregateJobs } = require('../services/jobSources');

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

    const jobs = await aggregateJobs(filters);
    res.json({ jobs, total: jobs.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

module.exports = router;
