'use strict';

/**
 * One-shot script: truncates the careers table and resets last_scraped_at
 * on all default_career_pages rows so the next sync (or --sync flag below)
 * re-scrapes everything with the latest tag extraction logic.
 *
 * Usage:
 *   node src/scripts/flushCareers.js          # flush only
 *   node src/scripts/flushCareers.js --sync   # flush + immediately re-scrape
 */

require('dotenv').config();

const { pool, initDb } = require('../db/database');
const { syncAllWatchedCompanies } = require('../services/careerPageScraper');

async function main() {
  await initDb();

  console.log('[flush] Truncating careers table...');
  await pool.query('TRUNCATE TABLE careers');

  console.log('[flush] Resetting last_scraped_at on default_career_pages...');
  await pool.query('UPDATE default_career_pages SET last_scraped_at = NULL');

  console.log('[flush] Resetting last_scraped_at on watched_companies...');
  await pool.query('UPDATE watched_companies SET last_scraped_at = NULL');

  console.log('[flush] Done.');

  if (process.argv.includes('--sync')) {
    console.log('[flush] Starting immediate re-sync...');
    await syncAllWatchedCompanies();
    console.log('[flush] Re-sync complete.');
  } else {
    console.log('[flush] Restart the server to trigger a fresh sync, or re-run with --sync.');
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
