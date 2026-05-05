const axios = require('axios');
const Parser = require('rss-parser');

const rssParser = new Parser({
  customFields: {
    item: ['description', 'pubDate', 'link', 'title'],
  },
  timeout: 10000,
});

// RemoteOK – free public API, no key needed
async function fetchRemoteOK(keywords, tags) {
  try {
    const res = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'JobHunt/1.0 (personal job tracker)' },
      timeout: 10000,
    });
    const jobs = res.data.filter(j => j.id); // first entry is metadata
    const query = [...keywords, ...tags].map(t => t.toLowerCase());

    return jobs
      .filter(job => {
        const searchText = [
          job.position,
          job.company,
          job.description,
          ...(job.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        return query.length === 0 || query.some(q => searchText.includes(q));
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

// We Work Remotely – RSS feed, no key needed
async function fetchWeWorkRemotely(category = 'devops-sysadmin') {
  // categories: devops-sysadmin, programming
  const urls = [
    `https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss`,
    `https://weworkremotely.com/categories/remote-programming-jobs.rss`,
  ];

  const results = [];
  for (const url of urls) {
    try {
      const feed = await rssParser.parseURL(url);
      feed.items.forEach((item, idx) => {
        const title = item.title || '';
        const company = extractCompany(title);
        results.push({
          job_id: `wwr-${Buffer.from(item.link || idx.toString()).toString('base64').slice(0, 16)}`,
          title: extractTitle(title),
          company,
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
    const query = keywords.join(' ') || 'devops cloud';
    const res = await axios.get(`https://himalayas.app/jobs/api`, {
      params: { q: query, limit: 50 },
      timeout: 10000,
    });
    const jobs = res.data.jobs || [];
    return jobs.map(job => ({
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
    const query = keywords.join(',') || 'devops';
    const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
      params: { search: query },
      timeout: 10000,
    });
    const jobs = res.data.data || [];
    return jobs
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

// helpers
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCompany(title) {
  // WWR title format: "Company: Job Title at Company"
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

const DEVOPS_CLOUD_KEYWORDS = [
  'devops', 'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'k8s',
  'terraform', 'ansible', 'docker', 'ci/cd', 'jenkins', 'github actions',
  'sre', 'site reliability', 'platform engineer', 'infrastructure',
  'helm', 'argocd', 'gitops', 'prometheus', 'grafana', 'datadog',
  'linux', 'bash', 'python', 'go', 'pulumi', 'cloudformation',
];

async function aggregateJobs(filters = {}) {
  const {
    keywords = [],
    tags = [],
    location = '',
    jobType = '',
    experienceLevel = '',
    remote = true,
  } = filters;

  // Always mix in DevOps/Cloud base keywords
  const searchKeywords = keywords.length > 0 ? keywords : DEVOPS_CLOUD_KEYWORDS.slice(0, 6);
  const searchTags = tags.length > 0 ? tags : ['devops', 'cloud', 'kubernetes', 'aws'];

  const [remoteOK, wwr, himalayas, arbeitNow] = await Promise.allSettled([
    fetchRemoteOK(searchKeywords, searchTags),
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

  // filter by user keywords if provided
  if (keywords.length > 0) {
    const kw = keywords.map(k => k.toLowerCase());
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.company} ${job.description} ${job.tags}`.toLowerCase();
      return kw.some(k => text.includes(k));
    });
  } else {
    // Default: keep only DevOps/Cloud relevant jobs
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.tags}`.toLowerCase();
      return DEVOPS_CLOUD_KEYWORDS.some(k => text.includes(k));
    });
  }

  // filter by job type
  if (jobType) {
    allJobs = allJobs.filter(job =>
      job.job_type.toLowerCase().includes(jobType.toLowerCase())
    );
  }

  // deduplicate by job_id
  const seen = new Set();
  allJobs = allJobs.filter(job => {
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });

  return allJobs;
}

module.exports = { aggregateJobs, DEVOPS_CLOUD_KEYWORDS };
