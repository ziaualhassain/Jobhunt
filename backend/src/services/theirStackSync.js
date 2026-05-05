const axios = require('axios');
const { pool } = require('../db/database');

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function formatSalary(min, max, currency = 'USD') {
  if (!min && !max) return '';
  if (min && max) return `${currency} ${Number(min).toLocaleString()} – ${Number(max).toLocaleString()}`;
  if (min) return `${currency} ${Number(min).toLocaleString()}+`;
  return '';
}

async function fetchPage(page) {
  const res = await axios.post('https://api.theirstack.com/v1/jobs/search', {
    order_by: [
      { desc: true, field: 'date_posted' },
      { desc: true, field: 'discovered_at' },
    ],
    page,
    limit: 100,
    posted_at_max_age_days: 30,
    blur_company_data: false,
    include_total_results: false,
    job_country_code_or: ['IN'],
    job_title_pattern_or: [
      'engineer', 'developer', 'software', 'data', 'cloud',
      'devops', 'fullstack', 'frontend', 'backend', 'architect',
    ],
    job_title_not: [],
    job_title_pattern_and: [],
    job_title_pattern_not: [],
    job_country_code_not: [],
    job_description_pattern_or: [],
    job_description_pattern_not: [],
    job_description_pattern_and: [],
    job_description_pattern_is_case_insensitive: true,
    job_description_contains_or: [],
    job_description_contains_not: [],
    job_seniority_or: [],
    job_technology_slug_or: [],
    job_technology_slug_not: [],
    job_technology_slug_and: [],
    job_location_pattern_or: [],
    job_location_pattern_not: [],
    company_name_or: [],
    industry_or: [],
    only_yc_companies: false,
  }, {
    headers: {
      Authorization: `Bearer ${process.env.THEIRSTACK_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 20000,
  });
  return res.data.data || [];
}

async function syncTheirStackJobs() {
  if (!process.env.THEIRSTACK_API_KEY) {
    console.log('[TheirStack] Skipping sync — THEIRSTACK_API_KEY not set');
    return;
  }

  console.log('[TheirStack] Starting India job sync…');
  let synced = 0;

  for (let page = 0; page < 3; page++) {
    let jobs;
    try {
      jobs = await fetchPage(page);
    } catch (err) {
      console.error(`[TheirStack] Page ${page} failed:`, err.message);
      break;
    }
    if (jobs.length === 0) break;

    for (const job of jobs) {
      const jobId = `theirstack-${job.id}`;
      const url = job.url || job.job_url || '';
      if (!url) continue; // skip jobs with no link

      try {
        await pool.query(`
          INSERT INTO theirstack_jobs
            (job_id, title, company, location, url, description,
             salary, job_type, tags, logo, date_posted, fetched_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          ON CONFLICT (job_id) DO UPDATE SET
            title       = EXCLUDED.title,
            company     = EXCLUDED.company,
            location    = EXCLUDED.location,
            description = EXCLUDED.description,
            salary      = EXCLUDED.salary,
            job_type    = EXCLUDED.job_type,
            tags        = EXCLUDED.tags,
            logo        = EXCLUDED.logo,
            date_posted = EXCLUDED.date_posted,
            fetched_at  = NOW()
        `, [
          jobId,
          job.name || job.title || '',
          job.company_name || job.company_object?.name || '',
          job.location || 'India',
          url,
          stripHtml(job.description || job.short_description || ''),
          formatSalary(job.salary_min, job.salary_max, job.salary_currency || 'USD'),
          job.employment_type || 'Full-time',
          (job.technology_slugs || []).join(', '),
          job.company_object?.logo_url || '',
          job.date_posted || null,
        ]);
        synced++;
      } catch (err) {
        console.error(`[TheirStack] Upsert failed for ${jobId}:`, err.message);
      }
    }

    console.log(`[TheirStack] Page ${page}: ${jobs.length} jobs`);
    if (jobs.length < 100) break;
  }

  console.log(`[TheirStack] Sync complete — ${synced} jobs stored`);
}

function startTheirStackSync() {
  syncTheirStackJobs();
  setInterval(syncTheirStackJobs, 6 * 60 * 60 * 1000); // refresh every 6 hours
}

module.exports = { startTheirStackSync };
