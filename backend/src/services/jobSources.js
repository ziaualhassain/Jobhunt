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
    const allKeywords = [...keywords, ...tags];

    return jobs
      .filter(job => {
        const text = [job.position, job.company, job.description, ...(job.tags || [])].join(' ');
        return matchesKeywords(text, allKeywords);
      })
      .map(job => ({
        job_id: `remoteok-${job.id}`,
        title: job.position,
        company: job.company,
        location: 'Remote',
        region: 'Remote',
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
          region: 'Remote',
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
    const query = apiSearchTerms(keywords);
    const res = await axios.get('https://himalayas.app/jobs/api', {
      params: { q: query, limit: 50 },
      timeout: 10000,
    });
    return (res.data.jobs || []).map(job => {
      const loc = job.locationRestrictions?.join(', ') || 'Remote';
      return {
        job_id: `himalayas-${job.id}`,
        title: job.title,
        company: job.companyName || '',
        location: loc,
        region: classifyRegion(loc),
        url: job.applicationLink || job.url || '',
        description: stripHtml(job.description || ''),
        salary: formatSalary(job.minSalary, job.maxSalary, job.currency),
        job_type: job.jobType || 'Full-time',
        source: 'Himalayas',
        tags: (job.categories || []).join(', '),
        logo: job.companyLogo || '',
      };
    });
  } catch (err) {
    console.error('[Himalayas] fetch failed:', err.message);
    return [];
  }
}

// Arbeit Now – free public API
async function fetchArbeitNow(keywords) {
  try {
    const query = apiSearchTerms(keywords);
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
        location: 'Remote',
        region: 'Remote',
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

// ─── Region classification ────────────────────────────────────────────────────

const REGION_MAP = [
  { region: 'Remote',    patterns: ['remote', 'anywhere', 'worldwide', 'global', 'international'] },
  { region: 'India',     patterns: ['india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'chennai', 'pune', 'kolkata', 'noida', 'gurgaon', 'gurugram'] },
  { region: 'US',        patterns: ['united states', 'usa', ' us ', ', us', 'new york', 'san francisco', 'california', 'texas', 'chicago', 'seattle', 'boston', 'austin', 'los angeles', 'denver', 'atlanta', 'miami'] },
  { region: 'UK',        patterns: ['united kingdom', 'england', 'london', 'manchester', 'edinburgh', 'birmingham', 'bristol', 'leeds'] },
  { region: 'UAE',       patterns: ['uae', 'dubai', 'abu dhabi', 'united arab', 'sharjah'] },
  { region: 'Canada',    patterns: ['canada', 'toronto', 'vancouver', 'montreal', 'calgary'] },
  { region: 'Australia', patterns: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth'] },
  { region: 'Europe',    patterns: ['europe', 'european', 'germany', 'berlin', 'munich', 'france', 'paris', 'netherlands', 'amsterdam', 'spain', 'madrid', 'italy', 'sweden', 'switzerland', 'poland'] },
  { region: 'Singapore', patterns: ['singapore'] },
];

function classifyRegion(location) {
  const loc = (location || '').toLowerCase();
  for (const { region, patterns } of REGION_MAP) {
    if (patterns.some(p => loc.includes(p))) return region;
  }
  return 'Other';
}

module.exports.classifyRegion = classifyRegion;

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

// Generic resume/job-description filler words that don't help narrow results
const STOP_WORDS = new Set([
  'solutions', 'technologies', 'technology', 'methodologies', 'methodology',
  'architecture', 'architectures', 'design', 'driven', 'native', 'based',
  'development', 'engineering', 'management', 'practices', 'principles',
  'concepts', 'patterns', 'strategy', 'strategies', 'framework', 'frameworks',
  'developer', 'engineer', 'specialist', 'professional',
  'and', 'for', 'the', 'with', 'using',
]);

/**
 * Extracts the meaningful words from a keyword phrase, stripping generic
 * filler. "java technologies" → ["java"], "cloud native solutions" → ["cloud"].
 */
function extractKeyTerms(keyword) {
  return keyword.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Returns true if the text satisfies at least one keyword (OR across keywords).
 * Within a keyword, all significant words must appear (AND), after stripping
 * generic filler. "java technologies" → needs "java"; "spring cloud" → needs
 * any significant word from it appears (OR within keyword, OR across keywords).
 * "spring cloud" matches if "spring" OR "cloud" appears anywhere in text.
 */
function matchesKeywords(text, keywords) {
  if (keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return keywords.some(kw => {
    const terms = extractKeyTerms(kw);
    if (terms.length === 0) return true;
    return terms.some(w => lower.includes(w)); // OR within keyword
  });
}

/** Best search terms to send to external APIs. */
function apiSearchTerms(keywords) {
  // External APIs (Himalayas, ArbeitNow) AND-interpret space-separated terms,
  // so sending many terms returns 0 results. Send at most 2 significant terms;
  // local matchesKeywords handles the full OR across all keywords after fetch.
  const terms = [...new Set(keywords.map(k => extractKeyTerms(k)[0]).filter(Boolean))];
  return terms.slice(0, 2).join(' ') || 'software developer';
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

const TECH_KEYWORDS = [
  'software', 'engineer', 'developer', 'frontend', 'backend', 'full stack',
  'react', 'node', 'python', 'java', 'typescript', 'javascript',
];

async function aggregateJobs(filters = {}) {
  const { keywords = [], tags = [], jobType = '', location = '', experienceLevel = '', remote = true, region = '' } = filters;

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

  // Keyword filter — word-level match, OR across keywords, AND across words within a keyword
  if (keywords.length > 0) {
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.company} ${job.description} ${job.tags} ${job.location}`;
      return matchesKeywords(text, keywords);
    });
  }

  // Tag filter — each tag is split into words (AND), tags are OR-ed
  if (tags.length > 0) {
    allJobs = allJobs.filter(job => {
      const text = `${job.title} ${job.tags} ${job.description}`.toLowerCase();
      return tags.some(tag =>
        tag.toLowerCase().split(/[\s\/]+/).filter(w => w.length > 1).every(w => text.includes(w))
      );
    });
  }

  // Location + remote filter — all four combinations always applied
  const loc = location.toLowerCase();
  allJobs = allJobs.filter(job => {
    const jobLoc = (job.location || '').toLowerCase();
    const isRemote = jobLoc.includes('remote') || jobLoc.includes('anywhere') ||
      jobLoc.includes('worldwide') || jobLoc.includes('global') || jobLoc.includes('international');
    const matchesLoc = loc ? jobLoc.includes(loc) : false;

    if (loc && remote)   return matchesLoc || isRemote; // city + remote ON: either
    if (loc && !remote)  return matchesLoc;              // city + remote OFF: city only
    if (!loc && remote)  return isRemote;                // no city + remote ON: remote only
    /* !loc && !remote */return true;                    // no constraint: show all
  });

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

  // Region filter.
  // When a specific country is selected (e.g. India), include both country-specific
  // jobs AND remote jobs — remote jobs are relevant to users in any country.
  // When Remote is explicitly selected, show only remote jobs.
  if (region && region !== 'Remote') {
    allJobs = allJobs.filter(job => {
      const jobRegion = job.region || classifyRegion(job.location);
      return jobRegion === region || jobRegion === 'Remote';
    });
  } else if (region === 'Remote') {
    allJobs = allJobs.filter(job => (job.region || classifyRegion(job.location)) === 'Remote');
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
