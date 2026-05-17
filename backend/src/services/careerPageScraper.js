'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const crypto  = require('crypto');
const { chromium } = require('playwright');
const { pool } = require('../db/database');
const { callLLM, shouldUseApi, OLLAMA_MODEL } = require('./llmProvider');
const { classifyRegion } = require('./jobSources');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function jobIdFromUrl(prefix, url) {
  return `${prefix}-${crypto.createHash('md5').update(url).digest('hex').slice(0, 16)}`;
}

// ─── ATS detection ───────────────────────────────────────────────────────────

function detectAts(url) {
  if (/boards\.greenhouse\.io|greenhouse\.io\/jobs/i.test(url))  return 'greenhouse';
  if (/jobs\.lever\.co/i.test(url))                              return 'lever';
  if (/bamboohr\.com/i.test(url))                                return 'bamboohr';
  if (/smartrecruiters\.com/i.test(url))                         return 'smartrecruiters';
  if (/jobs\.ashbyhq\.com/i.test(url))                           return 'ashby';
  if (/myworkdayjobs\.com|workday\.com/i.test(url))              return 'workday';
  return 'generic';
}

// ─── ATS-specific scrapers ────────────────────────────────────────────────────

async function scrapeGreenhouse(careerUrl, companyName) {
  // Extract board slug from URL: boards.greenhouse.io/SLUG or COMPANY.greenhouse.io
  const slug = careerUrl.match(/greenhouse\.io\/([^\/\?#]+)/)?.[1];
  if (!slug) return [];
  const { data } = await axios.get(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    { timeout: 12000 },
  );
  return (data.jobs || []).map(job => ({
    job_id:      `greenhouse-${job.id}`,
    title:       job.title,
    company:     companyName,
    location:    job.location?.name || 'Not specified',
    region:      classifyRegion(job.location?.name || ''),
    url:         job.absolute_url,
    description: stripHtml(job.content || '').slice(0, 500),
    job_type:    'Full-time',
    tags:        (job.departments || []).map(d => d.name).join(', '),
  }));
}

async function scrapeLever(careerUrl, companyName) {
  const slug = careerUrl.match(/lever\.co\/([^\/\?#]+)/)?.[1];
  if (!slug) return [];
  const { data } = await axios.get(
    `https://api.lever.co/v0/postings/${slug}?mode=json`,
    { timeout: 12000 },
  );
  return (Array.isArray(data) ? data : []).map(job => ({
    job_id:      `lever-${job.id}`,
    title:       job.text,
    company:     companyName,
    location:    job.categories?.location || job.workplaceType || 'Not specified',
    region:      classifyRegion(job.categories?.location || ''),
    url:         job.hostedUrl,
    description: (job.descriptionPlain || '').slice(0, 500),
    job_type:    job.workplaceType || 'Full-time',
    tags:        [job.categories?.team, job.categories?.department].filter(Boolean).join(', '),
  }));
}

async function scrapeBambooHR(careerUrl, companyName) {
  // https://COMPANY.bamboohr.com/careers → API at /careers/list
  const subdomain = careerUrl.match(/https?:\/\/([^.]+)\.bamboohr\.com/i)?.[1];
  if (!subdomain) return [];
  const { data } = await axios.get(
    `https://${subdomain}.bamboohr.com/careers/list`,
    { headers: { Accept: 'application/json' }, timeout: 12000 },
  );
  return (data.result || []).map(job => ({
    job_id:      `bamboohr-${subdomain}-${job.id}`,
    title:       job.jobOpeningName,
    company:     companyName,
    location:    [job.locationCity, job.locationState].filter(Boolean).join(', ') || 'Not specified',
    region:      classifyRegion([job.locationCity, job.locationState].join(' ')),
    url:         `https://${subdomain}.bamboohr.com/careers/${job.id}`,
    description: job.summary || '',
    job_type:    job.employmentStatusLabel || 'Full-time',
    tags:        job.department?.name || '',
  }));
}

async function scrapeSmartRecruiters(careerUrl, companyName) {
  const slug = careerUrl.match(/smartrecruiters\.com\/([^\/\?#]+)/)?.[1];
  if (!slug) return [];
  const { data } = await axios.get(
    `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
    { timeout: 12000 },
  );
  return (data.content || []).map(job => ({
    job_id:      `sr-${job.id}`,
    title:       job.name,
    company:     companyName,
    location:    [job.location?.city, job.location?.country].filter(Boolean).join(', ') || 'Not specified',
    region:      classifyRegion([job.location?.city, job.location?.country].join(' ')),
    url:         `https://jobs.smartrecruiters.com/${slug}/${job.id}`,
    description: '',
    job_type:    job.typeOfEmployment?.label || 'Full-time',
    tags:        job.department?.label || '',
  }));
}

async function scrapeAshby(careerUrl, companyName) {
  const slug = careerUrl.match(/ashbyhq\.com\/([^\/\?#]+)/)?.[1];
  if (!slug) return [];
  const { data } = await axios.post(
    'https://jobs.ashbyhq.com/api/non-user-graphql',
    {
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: slug },
      query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
          jobPostings { id title isRemote locationName employmentType { name } team { name } externalLink }
        }
      }`,
    },
    { timeout: 12000 },
  );
  const postings = data?.data?.jobBoard?.jobPostings || [];
  return postings.map(job => ({
    job_id:      `ashby-${job.id}`,
    title:       job.title,
    company:     companyName,
    location:    job.isRemote ? 'Remote' : (job.locationName || 'Not specified'),
    region:      classifyRegion(job.isRemote ? 'Remote' : (job.locationName || '')),
    url:         job.externalLink || `https://jobs.ashbyhq.com/${slug}/${job.id}`,
    description: '',
    job_type:    job.employmentType?.name || 'Full-time',
    tags:        job.team?.name || '',
  }));
}

// ─── Generic: HTTP fetch + AI extraction ─────────────────────────────────────

async function extractJobsWithAi(pageText, companyName) {
  const prompt = `Extract all job listings from this career page content for ${companyName}.
Return ONLY a valid JSON array. Each item must have: title, location, url, job_type.
If you cannot find any job listings, return [].
Do not include any text outside the JSON array.

Page content:
${pageText.slice(0, 3000)}`;

  try {
    const response = await callLLM({
      systemText: 'You extract structured data from career pages. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      tools: [],
    });
    const text = (response.content || []).find(b => b.type === 'text')?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const jobs = JSON.parse(jsonMatch[0]);
    return (Array.isArray(jobs) ? jobs : []).map(job => ({
      job_id:      jobIdFromUrl(`generic-${companyName.toLowerCase().replace(/\s+/g, '-')}`, job.url || job.title || ''),
      title:       job.title || 'Untitled',
      company:     companyName,
      location:    job.location || 'Not specified',
      region:      classifyRegion(job.location || ''),
      url:         job.url || '',
      description: job.description || '',
      job_type:    job.job_type || 'Full-time',
      tags:        job.tags || '',
    }));
  } catch (err) {
    console.error('[CareerScraper] AI extraction failed:', err.message);
    return [];
  }
}

async function scrapeWithHttp(careerUrl, companyName) {
  const res = await axios.get(careerUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JobHunt/1.0; career page indexer)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data);
  // Remove scripts, styles, nav, footer — keep the main content
  $('script, style, nav, footer, header, [role="navigation"]').remove();
  const pageText = $('body').text().replace(/\s+/g, ' ').trim();
  if (pageText.length < 200) throw new Error('Page too sparse — likely a SPA');
  return extractJobsWithAi(pageText, companyName);
}

async function scrapeWithPlaywright(careerUrl, companyName) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for any lazy-loaded content
    await page.waitForTimeout(2000);
    const pageText = await page.evaluate(() => document.body.innerText);
    return extractJobsWithAi(pageText, companyName);
  } finally {
    await browser.close().catch(() => {});
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function scrapeCareerPage(companyName, careerUrl) {
  const ats = detectAts(careerUrl);
  console.log(`[CareerScraper] Scraping ${companyName} (${ats}): ${careerUrl}`);

  try {
    let jobs = [];
    switch (ats) {
      case 'greenhouse':     jobs = await scrapeGreenhouse(careerUrl, companyName);     break;
      case 'lever':          jobs = await scrapeLever(careerUrl, companyName);          break;
      case 'bamboohr':       jobs = await scrapeBambooHR(careerUrl, companyName);       break;
      case 'smartrecruiters':jobs = await scrapeSmartRecruiters(careerUrl, companyName);break;
      case 'ashby':          jobs = await scrapeAshby(careerUrl, companyName);          break;
      default: {
        // Try plain HTTP first; fall back to Playwright for SPAs/JS-heavy pages
        try {
          jobs = await scrapeWithHttp(careerUrl, companyName);
        } catch {
          jobs = await scrapeWithPlaywright(careerUrl, companyName);
        }
      }
    }

    console.log(`[CareerScraper] ${companyName}: found ${jobs.length} jobs`);
    return { jobs, error: null };
  } catch (err) {
    console.error(`[CareerScraper] ${companyName} failed:`, err.message);
    return { jobs: [], error: err.message };
  }
}

// ─── DB sync ─────────────────────────────────────────────────────────────────

async function upsertJobs(jobs, careerUrl, companyName) {
  if (jobs.length === 0) return;
  for (const job of jobs) {
    await pool.query(`
      INSERT INTO career_page_jobs
        (job_id, company_name, career_url, title, location, region, url, description, job_type, tags)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (job_id) DO UPDATE SET
        title       = EXCLUDED.title,
        location    = EXCLUDED.location,
        region      = EXCLUDED.region,
        description = EXCLUDED.description,
        job_type    = EXCLUDED.job_type,
        tags        = EXCLUDED.tags,
        scraped_at  = NOW()
    `, [
      job.job_id, companyName, careerUrl,
      job.title, job.location, job.region,
      job.url, job.description, job.job_type, job.tags,
    ]).catch(err => console.error('[CareerScraper] upsert error:', err.message));
  }
}

async function syncAllWatchedCompanies() {
  // Find all distinct career URLs that are stale (not scraped in the last 6 hours)
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (career_url) id, user_id, company_name, career_url
    FROM watched_companies
    WHERE is_active = true
      AND (last_scraped_at IS NULL OR last_scraped_at < NOW() - INTERVAL '6 hours')
    ORDER BY career_url, last_scraped_at ASC NULLS FIRST
  `);

  for (const row of rows) {
    const { jobs, error } = await scrapeCareerPage(row.company_name, row.career_url);
    await upsertJobs(jobs, row.career_url, row.company_name);

    // Update last_scraped_at and error for ALL users watching this URL
    await pool.query(`
      UPDATE watched_companies
      SET last_scraped_at = NOW(), scrape_error = $1, job_count = $2
      WHERE career_url = $3
    `, [error, jobs.length, row.career_url]);
  }
}

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function startCareerPageSync() {
  // Initial sync after 30 s (let the server start first)
  setTimeout(async () => {
    try { await syncAllWatchedCompanies(); } catch (e) { console.error('[CareerScraper] Initial sync error:', e.message); }
  }, 30_000);

  setInterval(async () => {
    try { await syncAllWatchedCompanies(); } catch (e) { console.error('[CareerScraper] Sync error:', e.message); }
  }, SYNC_INTERVAL_MS);

  console.log('[CareerScraper] Sync scheduled every 6 h');
}

module.exports = { scrapeCareerPage, syncAllWatchedCompanies, startCareerPageSync, upsertJobs };
