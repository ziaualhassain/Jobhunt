const axios = require('axios');
const { pool } = require('../db/database');
const { enrichMissingTitles } = require('./titleExtractor');

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

// Countries to sync — each gets its own region tag in the DB
const REGION_SYNCS = [
  { code: 'IN', region: 'India',     pages: 12 },
  { code: 'US', region: 'US',        pages: 8  },
  { code: 'GB', region: 'UK',        pages: 6  },
  { code: 'AE', region: 'UAE',       pages: 4  },
];

async function fetchPage(countryCode, page) {
  const res = await axios.post('https://api.theirstack.com/v1/jobs/search', {
    order_by: [
      { desc: true, field: 'date_posted' },
      { desc: true, field: 'discovered_at' },
    ],
    page,
    limit: 25,
    posted_at_max_age_days: 30,
    blur_company_data: false,
    include_total_results: false,
    job_country_code_or: [countryCode],
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

async function syncRegion({ code, region, pages }) {
  console.log(`[TheirStack] Syncing ${region} (${code})…`);
  let synced = 0;

  for (let page = 0; page < pages; page++) {
    let jobs;
    try {
      jobs = await fetchPage(code, page);
    } catch (err) {
      const body = err.response?.data;
      console.error(`[TheirStack/${region}] Page ${page} failed (${err.response?.status ?? 'network'}):`, body ?? err.message);
      break;
    }
    if (jobs.length === 0) break;

    for (const job of jobs) {
      const jobId = `theirstack-${job.id}`;
      const url = job.url || job.job_url || '';
      if (!url) continue;

      try {
        await pool.query(`
          INSERT INTO theirstack_jobs
            (job_id, title, company, location, url, description,
             salary, job_type, tags, logo, date_posted, region, fetched_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
          ON CONFLICT (job_id) DO UPDATE SET
            title       = CASE WHEN EXCLUDED.title != '' THEN EXCLUDED.title ELSE theirstack_jobs.title END,
            company     = EXCLUDED.company,
            location    = EXCLUDED.location,
            description = EXCLUDED.description,
            salary      = EXCLUDED.salary,
            job_type    = EXCLUDED.job_type,
            tags        = EXCLUDED.tags,
            logo        = EXCLUDED.logo,
            date_posted = EXCLUDED.date_posted,
            region      = EXCLUDED.region,
            fetched_at  = NOW()
        `, [
          jobId,
          job.name || job.title || '',
          job.company_name || job.company_object?.name || '',
          job.location || region,
          url,
          stripHtml(job.description || job.short_description || ''),
          formatSalary(job.salary_min, job.salary_max, job.salary_currency || 'USD'),
          job.employment_type || 'Full-time',
          (job.technology_slugs || []).join(', '),
          job.company_object?.logo_url || '',
          job.date_posted || null,
          region,
        ]);
        synced++;
      } catch (err) {
        console.error(`[TheirStack/${region}] Upsert failed for ${jobId}:`, err.message);
      }
    }

    console.log(`[TheirStack/${region}] Page ${page}: ${jobs.length} jobs`);
    if (jobs.length < 25) break;
  }

  return synced;
}

async function syncTheirStackJobs() {
  if (!process.env.THEIRSTACK_API_KEY) {
    console.log('[TheirStack] Skipping sync — THEIRSTACK_API_KEY not set');
    return;
  }
  if (process.env.REFRESH_THEIRSTACK !== 'true') {
    console.log('[TheirStack] Skipping sync — REFRESH_THEIRSTACK is not true (existing DB rows will still be served)');
    return;
  }

  let total = 0;
  for (const config of REGION_SYNCS) {
    try {
      const synced = await syncRegion(config);
      total += synced;
    } catch (err) {
      console.error(`[TheirStack] Region ${config.region} sync error:`, err.message);
    }
  }
  console.log(`[TheirStack] Full sync complete — ${total} jobs stored across all regions`);
  // Async — don't block the sync cycle
  enrichMissingTitles().catch(err => console.error('[TitleExtractor] Post-sync run failed:', err.message));
}

function startTheirStackSync() {
  syncTheirStackJobs();
  setInterval(syncTheirStackJobs, 6 * 60 * 60 * 1000); // refresh every 6 hours

  // Enrich titles on startup for any existing blank-title rows in DB,
  // independent of REFRESH_THEIRSTACK (enrichment only needs ANTHROPIC_API_KEY)
  enrichMissingTitles().catch(err => console.error('[TitleExtractor] Startup run failed:', err.message));
}

module.exports = { startTheirStackSync };
