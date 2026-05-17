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

// ─── Tech skill extraction ────────────────────────────────────────────────────

const TECH_SKILL_PATTERNS = [
  // Languages
  [/\bpython\b/i,                               'Python'],
  [/\bjava(?!script)\b/i,                       'Java'],
  [/\btypescript\b/i,                           'TypeScript'],
  [/\bjavascript\b/i,                           'JavaScript'],
  [/\brust\b/i,                                 'Rust'],
  [/\bgolang\b|\bgo\s+(?:developer|engineer|lang)\b/i, 'Go'],
  [/\bruby\b/i,                                 'Ruby'],
  [/\bphp\b/i,                                  'PHP'],
  [/\bc\+\+\b/i,                                'C++'],
  [/\bc#\b/i,                                   'C#'],
  [/\bscala\b/i,                                'Scala'],
  [/\bkotlin\b/i,                               'Kotlin'],
  [/\bswift\b/i,                                'Swift'],
  [/\belixir\b/i,                               'Elixir'],
  [/\bhaskell\b/i,                              'Haskell'],
  [/\bsolidity\b/i,                             'Solidity'],
  // Frontend frameworks / tools
  [/\breact(?:\.js)?\b/i,                       'React'],
  [/\bvue(?:\.js)?\b/i,                         'Vue.js'],
  [/\bangular\b/i,                              'Angular'],
  [/\bnext\.js\b|\bnextjs\b/i,                  'Next.js'],
  [/\bnuxt(?:\.js)?\b/i,                        'Nuxt.js'],
  [/\bsvelte\b/i,                               'Svelte'],
  [/\btailwind(?:\s+css)?\b/i,                  'Tailwind CSS'],
  [/\bgraphql\b/i,                              'GraphQL'],
  [/\bwebpack\b/i,                              'Webpack'],
  [/\bvite\b/i,                                 'Vite'],
  [/\bhtml5?\b/i,                               'HTML'],
  [/\bcss3?\b/i,                                'CSS'],
  // Backend / frameworks
  [/\bnode(?:\.js)?\b|\bnodejs\b/i,             'Node.js'],
  [/\bexpress(?:\.js)?\b/i,                     'Express'],
  [/\bdjango\b/i,                               'Django'],
  [/\bflask\b/i,                                'Flask'],
  [/\bfastapi\b/i,                              'FastAPI'],
  [/\bspring\s+boot\b/i,                        'Spring Boot'],
  [/\bruby\s+on\s+rails\b|\brails\b/i,          'Rails'],
  [/\blaravel\b/i,                              'Laravel'],
  [/\bnestjs\b|\bnest\.js\b/i,                  'NestJS'],
  // Databases
  [/\bpostgresql\b|\bpostgres\b/i,              'PostgreSQL'],
  [/\bmysql\b/i,                                'MySQL'],
  [/\bmongodb\b/i,                              'MongoDB'],
  [/\bredis\b/i,                                'Redis'],
  [/\belasticsearch\b/i,                        'Elasticsearch'],
  [/\bcassandra\b/i,                            'Cassandra'],
  [/\bdynamodb\b/i,                             'DynamoDB'],
  [/\bsnowflake\b/i,                            'Snowflake'],
  [/\bbigquery\b/i,                             'BigQuery'],
  [/\bsqlite\b/i,                               'SQLite'],
  [/\bprisma\b/i,                               'Prisma'],
  [/\bsql\b/i,                                  'SQL'],
  [/\bnosql\b/i,                                'NoSQL'],
  // Cloud & DevOps
  [/\baws\b|\bamazon\s+web\s+services\b/i,      'AWS'],
  [/\bgoogle\s+cloud\b|\bgcp\b/i,               'GCP'],
  [/\bmicrosoft\s+azure\b|\bazure\b/i,          'Azure'],
  [/\bkubernetes\b|\bk8s\b/i,                   'Kubernetes'],
  [/\bdocker\b/i,                               'Docker'],
  [/\bterraform\b/i,                            'Terraform'],
  [/\bci\/cd\b/i,                               'CI/CD'],
  [/\bjenkins\b/i,                              'Jenkins'],
  [/\bgithub\s+actions\b/i,                     'GitHub Actions'],
  [/\bansible\b/i,                              'Ansible'],
  [/\bhelm\b/i,                                 'Helm'],
  [/\bserverless\b/i,                           'Serverless'],
  [/\bmicroservice\b/i,                         'Microservices'],
  // ML / Data / AI
  [/\bmachine\s+learning\b/i,                   'Machine Learning'],
  [/\bdeep\s+learning\b/i,                      'Deep Learning'],
  [/\bpytorch\b/i,                              'PyTorch'],
  [/\btensorflow\b/i,                           'TensorFlow'],
  [/\bscikit[- ]learn\b/i,                      'scikit-learn'],
  [/\bpandas\b/i,                               'Pandas'],
  [/\bnumpy\b/i,                                'NumPy'],
  [/\bapache\s+spark\b|\bpyspark\b/i,           'Apache Spark'],
  [/\bairflow\b/i,                              'Airflow'],
  [/\blarge\s+language\s+models?\b|\bllms?\b/i, 'LLMs'],
  [/\bcomputer\s+vision\b/i,                    'Computer Vision'],
  [/\bnatural\s+language\s+processing\b|\bnlp\b/i, 'NLP'],
  [/\bdata\s+science\b/i,                       'Data Science'],
  [/\bmlops\b/i,                                'MLOps'],
  // Mobile
  [/\breact\s+native\b/i,                       'React Native'],
  [/\bflutter\b/i,                              'Flutter'],
  [/\bios\b/i,                                  'iOS'],
  [/\bandroid\b/i,                              'Android'],
  // APIs & architecture
  [/\brest(?:ful)?\s*api\b/i,                   'REST API'],
  [/\bgrpc\b/i,                                 'gRPC'],
  [/\bwebsocket\b/i,                            'WebSockets'],
  [/\boauth\b/i,                                'OAuth'],
  [/\bjwt\b/i,                                  'JWT'],
  // Tools
  [/\bgit\b/i,                                  'Git'],
  [/\blinux\b/i,                                'Linux'],
  [/\bfigma\b/i,                                'Figma'],
];

function extractTechTags(title, description) {
  const text = `${title} ${description}`;
  const seen = new Set();
  const tags = [];
  for (const [pattern, name] of TECH_SKILL_PATTERNS) {
    if (!seen.has(name) && pattern.test(text)) {
      seen.add(name);
      tags.push(name);
    }
  }
  return tags.join(', ');
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
  return (data.jobs || []).map(job => {
    const desc = stripHtml(job.content || '');
    return {
      job_id:      `greenhouse-${job.id}`,
      title:       job.title,
      company:     companyName,
      location:    job.location?.name || 'Not specified',
      region:      classifyRegion(job.location?.name || ''),
      url:         job.absolute_url,
      description: desc.slice(0, 2000),
      job_type:    'Full-time',
      tags:        extractTechTags(job.title, desc),
    };
  });
}

function mapLeverJob(job, companyName) {
  const desc = job.descriptionPlain || '';
  return {
    job_id:      `lever-${job.id}`,
    title:       job.text,
    company:     companyName,
    location:    job.categories?.location || job.workplaceType || 'Not specified',
    region:      classifyRegion(job.categories?.location || ''),
    url:         job.hostedUrl,
    description: desc.slice(0, 2000),
    job_type:    job.workplaceType || 'Full-time',
    tags:        extractTechTags(job.text, desc),
  };
}

async function scrapeLever(careerUrl, companyName) {
  const slug = careerUrl.match(/lever\.co\/([^\/\?#]+)/)?.[1];
  if (!slug) return [];

  // Try the v0 JSON API first (works for companies that haven't disabled it)
  try {
    const { data } = await axios.get(
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
      { timeout: 12000 },
    );
    if (Array.isArray(data) && data.length > 0) {
      return data.map(job => mapLeverJob(job, companyName));
    }
  } catch { /* fall through to HTML scrape */ }

  // Fallback: scrape the board page and extract __NEXT_DATA__
  const { data: html } = await axios.get(careerUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunt/1.0)' },
    timeout: 15000,
  });
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  const nextData = JSON.parse(match[1]);
  const postings = nextData?.props?.pageProps?.postings ?? nextData?.props?.pageProps?.data?.postings ?? [];
  return postings.map(job => mapLeverJob(job, companyName));
}

async function scrapeBambooHR(careerUrl, companyName) {
  // https://COMPANY.bamboohr.com/careers → API at /careers/list
  const subdomain = careerUrl.match(/https?:\/\/([^.]+)\.bamboohr\.com/i)?.[1];
  if (!subdomain) return [];
  const { data } = await axios.get(
    `https://${subdomain}.bamboohr.com/careers/list`,
    { headers: { Accept: 'application/json' }, timeout: 12000 },
  );
  return (data.result || []).map(job => {
    const desc = job.summary || '';
    return {
      job_id:      `bamboohr-${subdomain}-${job.id}`,
      title:       job.jobOpeningName,
      company:     companyName,
      location:    [job.locationCity, job.locationState].filter(Boolean).join(', ') || 'Not specified',
      region:      classifyRegion([job.locationCity, job.locationState].join(' ')),
      url:         `https://${subdomain}.bamboohr.com/careers/${job.id}`,
      description: desc,
      job_type:    job.employmentStatusLabel || 'Full-time',
      tags:        extractTechTags(job.jobOpeningName, desc),
    };
  });
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
    tags:        extractTechTags(job.name, ''),
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
          jobPostings { id title isRemote locationName descriptionHtml employmentType { name } team { name } externalLink }
        }
      }`,
    },
    { timeout: 12000 },
  );
  const postings = data?.data?.jobBoard?.jobPostings || [];
  return postings.map(job => {
    const desc = stripHtml(job.descriptionHtml || '');
    return {
      job_id:      `ashby-${job.id}`,
      title:       job.title,
      company:     companyName,
      location:    job.isRemote ? 'Remote' : (job.locationName || 'Not specified'),
      region:      classifyRegion(job.isRemote ? 'Remote' : (job.locationName || '')),
      url:         job.externalLink || `https://jobs.ashbyhq.com/${slug}/${job.id}`,
      description: desc.slice(0, 2000),
      job_type:    job.employmentType?.name || 'Full-time',
      tags:        extractTechTags(job.title, desc),
    };
  });
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

// ─── Default companies (visible to all users, no watchlist needed) ────────────
// Only ATS platforms with structured public APIs (Greenhouse, Lever, Ashby) so
// scraping works without AI or Playwright.

const DEFAULT_COMPANIES = [
  // Greenhouse — confirmed working board slugs
  { name: 'Airbnb',      url: 'https://boards.greenhouse.io/airbnb' },
  { name: 'Figma',       url: 'https://boards.greenhouse.io/figma' },
  { name: 'Discord',     url: 'https://boards.greenhouse.io/discord' },
  { name: 'Stripe',      url: 'https://boards.greenhouse.io/stripe' },
  { name: 'Airtable',    url: 'https://boards.greenhouse.io/airtable' },
  { name: 'Vercel',      url: 'https://boards.greenhouse.io/vercel' },
  { name: 'Brex',        url: 'https://boards.greenhouse.io/brex' },
  { name: 'Plaid',       url: 'https://boards.greenhouse.io/plaid' },
  // Ashby — structured GraphQL API
  { name: 'Linear',      url: 'https://jobs.ashbyhq.com/linear' },
  { name: 'Notion',      url: 'https://jobs.ashbyhq.com/notion' },
  { name: 'Retool',      url: 'https://jobs.ashbyhq.com/retool' },
  { name: 'Loom',        url: 'https://jobs.ashbyhq.com/loom' },
];

// ─── DB sync ─────────────────────────────────────────────────────────────────

async function upsertJobs(jobs, careerUrl, companyName) {
  if (jobs.length === 0) return;
  for (const job of jobs) {
    await pool.query(`
      INSERT INTO careers
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

async function syncDefaultCompanies() {
  // Seed defaults into default_career_pages then scrape stale ones
  for (const { name, url } of DEFAULT_COMPANIES) {
    await pool.query(`
      INSERT INTO default_career_pages (company_name, career_url)
      VALUES ($1, $2)
      ON CONFLICT (career_url) DO NOTHING
    `, [name, url]).catch(() => {});
  }

  const { rows } = await pool.query(`
    SELECT company_name, career_url FROM default_career_pages
    WHERE last_scraped_at IS NULL OR last_scraped_at < NOW() - ($1 * INTERVAL '1 hour')
  `, [SYNC_INTERVAL_HOURS]);

  for (const row of rows) {
    const { jobs, error } = await scrapeCareerPage(row.company_name, row.career_url);
    await upsertJobs(jobs, row.career_url, row.company_name);
    await pool.query(
      'UPDATE default_career_pages SET last_scraped_at = NOW(), scrape_error = $1, job_count = $2 WHERE career_url = $3',
      [error, jobs.length, row.career_url],
    );
  }
}

async function syncAllWatchedCompanies() {
  // 1. Sync user-added companies
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (career_url) id, user_id, company_name, career_url
    FROM watched_companies
    WHERE is_active = true
      AND (last_scraped_at IS NULL OR last_scraped_at < NOW() - ($1 * INTERVAL '1 hour'))
    ORDER BY career_url, last_scraped_at ASC NULLS FIRST
  `, [SYNC_INTERVAL_HOURS]);

  for (const row of rows) {
    const { jobs, error } = await scrapeCareerPage(row.company_name, row.career_url);
    await upsertJobs(jobs, row.career_url, row.company_name);
    await pool.query(`
      UPDATE watched_companies
      SET last_scraped_at = NOW(), scrape_error = $1, job_count = $2
      WHERE career_url = $3
    `, [error, jobs.length, row.career_url]);
  }

  // 2. Sync defaults
  await syncDefaultCompanies();
}

// CAREER_SYNC_HOURS=6  (default). Set lower (e.g. 1) to scrape more frequently.
const SYNC_INTERVAL_HOURS = Math.max(1, parseInt(process.env.CAREER_SYNC_HOURS || '6', 10));
const SYNC_INTERVAL_MS    = SYNC_INTERVAL_HOURS * 60 * 60 * 1000;

function startCareerPageSync() {
  setTimeout(async () => {
    try { await syncAllWatchedCompanies(); } catch (e) { console.error('[CareerScraper] Initial sync error:', e.message); }
  }, 30_000);

  setInterval(async () => {
    try { await syncAllWatchedCompanies(); } catch (e) { console.error('[CareerScraper] Sync error:', e.message); }
  }, SYNC_INTERVAL_MS);

  console.log(`[CareerScraper] Sync scheduled every ${SYNC_INTERVAL_HOURS} h`);
}

module.exports = { scrapeCareerPage, syncAllWatchedCompanies, startCareerPageSync, upsertJobs, DEFAULT_COMPANIES };
