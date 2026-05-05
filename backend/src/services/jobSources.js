const axios = require('axios');
const Parser = require('rss-parser');

const rssParser = new Parser({
  customFields: { item: ['description', 'pubDate', 'link', 'title'] },
  timeout: 10000,
});

// RemoteOK – free public API, no key needed
async function fetchRemoteOK(keywords, tags) {
  try {
    const res = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'JobHunt/1.0 (personal job tracker)' },
      timeout: 10000,
    });
    const jobs = res.data.filter(j => j.id);
    const query = [...keywords, ...tags].map(t => t.toLowerCase());

    return jobs
      .filter(job => {
        if (query.length === 0) return true;
        const text = [job.position, job.company, job.description, ...(job.tags || [])]
          .join(' ').toLowerCase();
        return query.some(q => text.includes(q));
      })
      .map(job => ({
        job_id: `remoteok-${job.id}`,
        title: job.position,
        company: job.company,
        location: 'Remote',
        url: job.url,
        description: stripHtml(job.description || ''),
        salary: job.salary || '',
        job_type: 'Full-time',
        source: 'RemoteOK',
        tags: (job.tags || []).join(', '),
        logo: job.company_logo || '',
      }));
  } catch (err) {
    console.error('[RemoteOK] fetch failed:', err.message);
    return [];
  }
}

// We Work Remotely – RSS feeds
async function fetchWeWorkRemotely() {
  const urls = [
    'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  ];

  const results = [];
  for (const url of urls) {
    try {
      const feed = await rssParser.parseURL(url);
      feed.items.forEach((item, idx) => {
        const title = item.title || '';
        results.push({
          job_id: `wwr-${Buffer.from(item.link || idx.toString()).toString('base64').slice(0, 16)}`,
          title: extractTitle(title),
          company: extractCompany(title),
          location: 'Remote',
          url: item.link,
          description: stripHtml(item.content || item.description || ''),
          salary: '',
          job_type: 'Full-time',
          source: 'We Work Remotely',
          tags: '',
          logo: '',
        });
      });
    } catch (err) {
      console.error('[WeWorkRemotely] fetch failed:', err.message);
    }
  }
  return results;
}

// Himalayas – free public API
async function fetchHimalayas(keywords) {
  try {
    const query = keywords.length > 0 ? keywords.join(' ') : 'software engineer developer';
    const res = await axios.get('https://himalayas.app/jobs/api', {
      params: { q: query, limit: 50 },
      timeout: 10000,
    });
    return (res.data.jobs || []).map(job => ({
      job_id: `himalayas-${job.id}`,
      title: job.title,
      company: job.companyName || '',
      location: job.locationRestrictions?.join(', ') || 'Remote',
      url: job.applicationLink || job.url || '',
      description: stripHtml(job.description || ''),
      salary: formatSalary(job.minSalary, job.maxSalary, job.currency),
      job_type: job.jobType || 'Full-time',
      source: 'Himalayas',
      tags: (job.categories || []).join(', '),
      logo: job.companyLogo || '',
    }));
  } catch (err) {
    console.error('[Himalayas] fetch failed:', err.message);
    return [];
  }
}

// Arbeit Now – free public API
async function fetchArbeitNow(keywords) {
  try {
    const query = keywords.length > 0 ? keywords.join(',') : 'software developer';
    const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
      params: { search: query },
      timeout: 10000,
    });
    return (res.data.data || [])
      .filter(job => job.remote)
      .map(job => ({
        job_id: `arbeitnow-${job.slug}`,
        title: job.title,
        company: job.company_name,
        location: job.location || 'Remote',
        url: job.url,
        description: stripHtml(job.description || ''),
        salary: '',
        job_type: job.job_types?.join(', ') || 'Full-time',
        source: 'ArbeitNow',
        tags: (job.tags || []).join(', '),
        logo: '',
      }));
  } catch (err) {
    console.error('[ArbeitNow] fetch failed:', err.message);
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function extractCompany(title) {
  const match = title.match(/^(.+?):\s+/);
  return match ? match[1].trim() : title;
}

function extractTitle(title) {
  const match = title.match(/:\s+(.+)$/);
  return match ? match[1].trim() : title;
}

function formatSalary(min, max, currency = 'USD') {
  if (!min && !max) return '';
  if (min && max) return `${currency} ${Number(min).toLocaleString()} – ${Number(max).toLocaleString()}`;
  if (min) return `${currency} ${Number(min).toLocaleString()}+`;
  return '';
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

const TECH_KEYWORDS = [
  'software', 'engineer', 'developer', 'frontend', 'backend', 'full stack',
  'react', 'node', 'python', 'java', 'typescript', 'javascript',
];

async function aggregateJobs(filters = {}) {
  const { keywords = [], tags = [], jobType = '', location = '', experienceLevel = '' } = filters;

  const searchKeywords = keywords.length > 0 ? keywords : TECH_KEYWORDS.slice(0, 6);

  const [remoteOK, wwr, himalayas, arbeitNow] = await Promise.allSettled([
    fetchRemoteOK(searchKeywords, tags),
    fetchWeWorkRemotely(),
    fetchHimalayas(searchKeywords),
    fetchArbeitNow(searchKeywords),
  ]);

  let allJobs = [
    ...(remoteOK.status === 'fulfilled' ? remoteOK.value : []),
    ...(wwr.status === 'fulfilled' ? wwr.value : []),
    ...(himalayas.status === 'fulfilled' ? himalayas.value : []),
    ...(arbeitNow.status === 'fulfilled' ? arbeitNow.value : []),
  ];

  // Keyword filter — includes location in searchable text
  if (keywords.length > 0) {
    const kw = keywords.map(k => k.toLowerCase());
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.company} ${job.description} ${job.tags} ${job.location}`.toLowerCase();
      return kw.some(k => text.includes(k));
    });
  }

  // Tag filter
  if (tags.length > 0) {
    const tagList = tags.map(t => t.toLowerCase());
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.tags} ${job.description}`.toLowerCase();
      return tagList.some(t => text.includes(t));
    });
  }

  // Location filter — always keep remote jobs since they're accessible anywhere
  if (location) {
    const loc = location.toLowerCase();
    allJobs = allJobs.filter(job => {
      const jobLoc = (job.location || '').toLowerCase();
      return jobLoc.includes(loc) || jobLoc.includes('remote') || jobLoc.includes('anywhere');
    });
  }

  // Experience level filter — match against title and description
  if (experienceLevel) {
    const level = experienceLevel.toLowerCase();
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.description}`.toLowerCase();
      return text.includes(level);
    });
  }

  // Job type filter
  if (jobType) {
    allJobs = allJobs.filter(job =>
      (job.job_type || '').toLowerCase().includes(jobType.toLowerCase())
    );
  }

  // Deduplicate
  const seen = new Set();
  allJobs = allJobs.filter(job => {
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });

  return allJobs;
}

module.exports = { aggregateJobs };
