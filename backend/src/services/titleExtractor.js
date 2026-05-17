const Anthropic = require('@anthropic-ai/sdk').default;
const { pool } = require('../db/database');

const BATCH_SIZE = 15;
const DESC_LIMIT  = 600; // chars per description sent to Claude

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

async function callClaude(descriptions) {
  const numbered = descriptions
    .map((d, i) => `[${i + 1}] ${(d || '').slice(0, DESC_LIMIT).replace(/\n+/g, ' ')}`)
    .join('\n\n');

  const msg = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content:
        'Extract the job title from each job description below.\n' +
        'Return ONLY a JSON array of strings — one per description, same order.\n' +
        'Use "" if the title cannot be determined. No explanation.\n\n' +
        `Descriptions:\n${numbered}`,
    }],
  });

  const text = msg.content[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return new Array(descriptions.length).fill('');
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : new Array(descriptions.length).fill('');
  } catch {
    return new Array(descriptions.length).fill('');
  }
}

async function enrichMissingTitles() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[TitleExtractor] Skipping — ANTHROPIC_API_KEY not set');
    return;
  }

  const [tsRows, careerRows] = await Promise.all([
    pool.query(
      `SELECT job_id, description FROM theirstack_jobs
       WHERE (title IS NULL OR title = '') AND description IS NOT NULL
       ORDER BY fetched_at DESC LIMIT 200`,
    ),
    pool.query(
      `SELECT job_id, description FROM careers
       WHERE (title IS NULL OR title = '') AND description IS NOT NULL
       ORDER BY scraped_at DESC LIMIT 200`,
    ),
  ]);

  const jobs = [
    ...tsRows.rows.map(r => ({ ...r, tbl: 'theirstack_jobs' })),
    ...careerRows.rows.map(r => ({ ...r, tbl: 'careers' })),
  ];

  if (jobs.length === 0) {
    console.log('[TitleExtractor] No jobs with missing titles — skipping');
    return;
  }

  console.log(`[TitleExtractor] Enriching ${jobs.length} jobs…`);
  let enriched = 0;

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    let titles;
    try {
      titles = await callClaude(batch.map(j => j.description));
    } catch (err) {
      console.error('[TitleExtractor] Claude error:', err.message);
      await sleep(2000);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const title = (titles[j] || '').trim();
      if (!title) continue;
      try {
        await pool.query(
          `UPDATE ${batch[j].tbl} SET title = $1 WHERE job_id = $2`,
          [title, batch[j].job_id],
        );
        enriched++;
      } catch (err) {
        console.error(`[TitleExtractor] Update failed ${batch[j].job_id}:`, err.message);
      }
    }

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const total    = Math.ceil(jobs.length / BATCH_SIZE);
    console.log(`[TitleExtractor] Batch ${batchNum}/${total} — enriched ${enriched} so far`);

    if (i + BATCH_SIZE < jobs.length) await sleep(400);
  }

  console.log(`[TitleExtractor] Done — ${enriched}/${jobs.length} titles enriched`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { enrichMissingTitles };
