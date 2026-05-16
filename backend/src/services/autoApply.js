'use strict';

// NOTE: Before using this service, run:
//   npx playwright install chromium
// This downloads the Chromium browser (~200MB) needed for automation.

const path = require('path');
const fs   = require('fs');
const { chromium } = require('playwright');
const { callLLM, shouldUseApi, OLLAMA_MODEL, OLLAMA_BASE } = require('./llmProvider');
const { UPLOAD_DIR, pool } = require('../db/database');

const SESSION_DIR = path.join(UPLOAD_DIR, '..', 'sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

function sessionPath(userId, site) {
  return path.join(SESSION_DIR, `${userId}-${site}.json`);
}

function hasSession(userId, site) {
  return fs.existsSync(sessionPath(userId, site));
}

const BROWSER_CONTEXT_OPTS = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
};

// Patterns that indicate the user is still on a login/2FA page
const LOGIN_URL_PATTERNS = [
  'login', 'signin', 'sign-in', 'checkpoint', 'challenge', 'verification',
  'two-factor', '2fa', 'otp', 'auth',
];
function isLoginPage(url) {
  const lower = url.toLowerCase();
  return LOGIN_URL_PATTERNS.some(p => lower.includes(p));
}

/**
 * Open a visible browser to the given URL, wait for the user to complete login
 * (including 2FA), then save the Playwright storageState to disk.
 * Streams status lines via the onLog callback.
 * Returns true if session was saved, false on timeout.
 */
async function createSession({ userId, site, loginUrl, onLog, timeoutMs = 5 * 60 * 1000 }) {
  onLog(`Opening browser for ${site} — please log in and complete any 2FA…`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext(BROWSER_CONTEXT_OPTS);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const deadline = Date.now() + timeoutMs;
    let saved = false;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2500));

      let currentUrl;
      try { currentUrl = page.url(); } catch { break; } // browser closed by user

      if (!isLoginPage(currentUrl)) {
        const sp = sessionPath(userId, site);
        await context.storageState({ path: sp });
        saved = true;
        onLog(`✅ Session saved for ${site}! Future auto-apply runs will skip login.`);
        break;
      }

      const remaining = Math.round((deadline - Date.now()) / 1000);
      onLog(`Waiting for you to finish logging in… (${remaining}s remaining)`);
    }

    if (!saved) onLog('⏰ Timed out — session not saved. Please try again.');
    return saved;
  } finally {
    await browser.close().catch(() => {});
  }
}

// Log which LLM will be used at startup
if (shouldUseApi('auto-apply')) {
  console.log('[AutoApply] LLM: Anthropic claude-opus-4-7');
} else {
  console.log(`[AutoApply] LLM: Ollama ${OLLAMA_MODEL} @ ${OLLAMA_BASE} (set ANTHROPIC_API_KEY to use Claude)`);
}

// Map of running apply jobs: runId → { status, logs, result }
const applyJobs = new Map();

function addLog(runId, msg) {
  const entry = applyJobs.get(runId);
  if (!entry) return;
  entry.logs.push({ ts: Date.now(), msg });
  console.log(`[AutoApply:${runId.slice(0, 8)}] ${msg}`);
}

/**
 * Start an auto-apply agent job.
 *
 * @param {object} opts
 * @param {string} opts.runId        - Unique ID for this job
 * @param {string} opts.jobUrl       - URL of the job posting
 * @param {string} opts.jobTitle     - Job title
 * @param {string} opts.jobCompany   - Company name
 * @param {string} opts.jobId        - jobs table job_id (for Kanban card creation)
 * @param {string} opts.jobSource    - Source site name (e.g. linkedin, naukri)
 * @param {string} opts.jobLocation  - Job location string
 * @param {object} opts.profile      - User profile (name, email, preferences.applicationProfile, skills)
 * @param {object} opts.credentials  - { email, password } for the job site
 * @param {string} opts.resumePath   - Absolute path to the resume file on disk
 * @param {string} opts.site         - Resolved credential site key
 */
async function startApplyJob({ runId, jobUrl, jobTitle, jobCompany, jobId, jobSource, jobLocation, profile, credentials, resumePath, site }) {
  // Initialise the job entry
  applyJobs.set(runId, { status: 'running', logs: [], result: null, resumeResolve: null, pauseReason: null });
  addLog(runId, `Starting apply job for ${jobTitle} at ${jobCompany}`);

  // Run the agent loop in the background (do not await here)
  _runAgentLoop({ runId, jobUrl, jobTitle, jobCompany, jobId, jobSource, jobLocation, profile, credentials, resumePath, site })
    .catch(err => {
      console.error(`[AutoApply:${runId.slice(0, 8)}] FATAL:`, err);
      addLog(runId, `Fatal error: ${err.message}`);
      const entry = applyJobs.get(runId);
      if (entry) {
        entry.status = 'error';
        entry.result = { success: false, message: err.message };
      }
    });
}

async function _runAgentLoop({ runId, jobUrl, jobTitle, jobCompany, jobId, jobSource, jobLocation, profile, credentials, resumePath, site }) {
  const appProfile = (profile.preferences && profile.preferences.applicationProfile) || {};
  const questionnaire = (profile.preferences && profile.preferences.questionnaire) || {};
  const skills = profile.skills || [];

  let browser = null;
  let page = null;

  try {
    const provider = shouldUseApi('auto-apply')
      ? 'Anthropic claude-opus-4-7'
      : `Ollama ${OLLAMA_MODEL} @ ${OLLAMA_BASE}`;
    addLog(runId, `LLM provider: ${provider}`);

    addLog(runId, 'Launching browser...');
    browser = await chromium.launch({
      headless: !shouldUseApi('auto-apply'),
      args: ['--disable-blink-features=AutomationControlled'],
    });

    // Load saved session (cookies + localStorage) if available — skips login + 2FA
    const sp = site ? sessionPath(profile.id, site) : null;
    const hasStoredSession = sp && fs.existsSync(sp);
    const contextOpts = hasStoredSession
      ? { ...BROWSER_CONTEXT_OPTS, storageState: sp }
      : BROWSER_CONTEXT_OPTS;

    if (hasStoredSession) {
      addLog(runId, `Loading saved session for ${site} — login/2FA will be skipped`);
    } else if (site) {
      addLog(runId, `No saved session for ${site} — will attempt credential login`);
    }

    const context = await browser.newContext(contextOpts);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    page = await context.newPage();

    addLog(runId, `Navigating to ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // ─── System prompt ───────────────────────────────────────────────────────
    const usingAnthropic = shouldUseApi('auto-apply');
    const systemPrompt = `You are a job application agent that controls a real web browser.
You MUST use tools to interact with the browser — never just describe what you would do.

RULES:
1. Always call a tool on every turn — never end your turn with plain text only.
2. Start by calling get_page_text to read what is on the page.
3. If the page has a login form, use fill_input and click_element to log in.
4. Fill every required application field using fill_input or type_text.
5. For <select> dropdowns, use fill_input with the visible label text (e.g. "No", "Yes", "Full-time").
   fill_input auto-detects select elements and calls selectOption internally.
6. When the application is submitted, call the done tool with success=true.
7. If you encounter a CAPTCHA, 2FA prompt, or anything a human must solve, call wait_for_human — DO NOT call done. The human will act in the browser and then signal you to continue.
8. If you hit a truly permanent blocker (page error, job already closed), call done with success=false.
You MUST call done at the end — no exceptions.

SCREENING QUESTIONS — use these default answers unless the candidate profile says otherwise:
- "Have you previously applied for this position / role?" → No
- "Have you ever been interviewed at [company]?" → No
- "Have you ever worked at [company]?" → No
- "Are you legally authorized to work in [country]?" → Yes
- "Do you now or will you in the future require visa sponsorship?" → No
- "Are you at least 18 years of age?" → Yes
- "Are you willing to work full-time / on-site / hybrid?" → Yes
- "Are you comfortable with the salary / compensation range?" → Yes
- "Are you currently employed?" → ${appProfile?.noticePeriod ? 'Yes' : 'No'}
- "Notice period / when can you start?" → ${appProfile?.noticePeriod || 'Immediately'}
- Gender, race, ethnicity, disability, veteran status → always choose "Prefer not to answer" / "I do not wish to self-identify" / "Decline to state"
- For any other yes/no screening question, default to the most favourable answer (Yes for willingness, No for disqualifying questions like "have you been terminated for misconduct").
${Object.keys(questionnaire).length > 0 ? `
CANDIDATE QUESTIONNAIRE ANSWERS (use these for matching form questions):
- Work authorized: ${questionnaire.workAuthorized || 'not specified'}
- Requires sponsorship: ${questionnaire.requiresSponsorship || 'not specified'}
- Citizenship/visa status: ${questionnaire.citizenshipStatus || 'not specified'}
- Highest degree: ${questionnaire.highestDegree || 'not specified'}
- Field of study: ${questionnaire.degreeField || 'not specified'}
- University: ${questionnaire.university || 'not specified'}
- Graduation year: ${questionnaire.graduationYear || 'not specified'}
- Willing to relocate: ${questionnaire.willingToRelocate || 'not specified'}
- Preferred work mode: ${questionnaire.preferredWorkMode || 'not specified'}
- Languages: ${questionnaire.languages || 'not specified'}
- Driving license: ${questionnaire.drivingLicense || 'not specified'}
- Gender: ${questionnaire.gender || 'prefer_not_to_say'}
- Ethnicity: ${questionnaire.ethnicity || 'prefer_not_to_say'}
- Veteran status: ${questionnaire.veteranStatus || 'no'}
- Disability status: ${questionnaire.disabilityStatus || 'no'}
Use these to fill matching dropdowns and fields. For EEO fields without an answer, select "Prefer not to say".` : ''}`;

    // ─── Initial user message ────────────────────────────────────────────────
    const initialMessage = `Apply for this job:
Title: ${jobTitle}
Company: ${jobCompany}
URL: ${jobUrl}

Candidate profile:
Name: ${profile.name}
Email: ${profile.email}
Phone: ${appProfile.phone || 'N/A'}
LinkedIn: ${appProfile.linkedinUrl || 'N/A'}
Intro: ${appProfile.intro || 'N/A'}
Current CTC: ${appProfile.currentCTC || 'N/A'}
Expected CTC: ${appProfile.expectedCTC || 'N/A'}
Notice Period: ${appProfile.noticePeriod || 'N/A'}
Skills: ${skills.join(', ')}

Credentials for this site: email=${credentials.email || 'not saved'}
(Password will be auto-filled when you use fill_input with value "USE_STORED_PASSWORD")

IMPORTANT: You must call a tool now. Start by calling get_interactive_elements to see what inputs and buttons are on the page.`;

    // ─── Tool definitions ────────────────────────────────────────────────────
    const tools = [
      {
        name: 'take_screenshot',
        description: 'Take a screenshot of the current browser page and return it as an image.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_interactive_elements',
        description: 'Returns all inputs, buttons, links and select fields on the page with their exact CSS selectors. Always call this before fill_input or click_element so you know which selectors actually exist.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'click_element',
        description: 'Click on an element by CSS selector or by x/y coordinates.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the element to click' },
            x: { type: 'number', description: 'X coordinate to click' },
            y: { type: 'number', description: 'Y coordinate to click' },
          },
          required: [],
        },
      },
      {
        name: 'type_text',
        description: 'Type text using the keyboard (simulates key presses).',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['text'],
        },
      },
      {
        name: 'fill_input',
        description: 'Fill an input field by CSS selector with a given value. Use value "USE_STORED_PASSWORD" to fill in the stored password. Call get_interactive_elements first to find valid selectors.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the input field' },
            value: { type: 'string', description: 'Value to fill in' },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'press_key',
        description: 'Press a keyboard key (e.g. Enter, Tab, Escape).',
        input_schema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Key to press (e.g. Enter, Tab, Escape)' },
          },
          required: ['key'],
        },
      },
      {
        name: 'get_page_text',
        description: 'Get the visible text content of the current page (up to 4000 characters).',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'navigate_to',
        description: 'Navigate the browser to a different URL.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to' },
          },
          required: ['url'],
        },
      },
      {
        name: 'upload_resume',
        description: 'Upload the resume file to a file input field.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the file input element' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'done',
        description: 'Signal that the application process is complete (success or failure).',
        input_schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', description: 'Whether the application was submitted successfully' },
            message: { type: 'string', description: 'Summary of what happened' },
          },
          required: ['success', 'message'],
        },
      },
      {
        name: 'wait_for_human',
        description: 'Pause and ask the human to take action in the browser (solve a CAPTCHA, approve 2FA, etc.). The browser stays open. Use this instead of done(success=false) whenever a human can unblock the situation.',
        input_schema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'What the human needs to do, e.g. "Solve the reCAPTCHA on screen then click Continue"' },
          },
          required: ['reason'],
        },
      },
    ];

    // ─── Agent message loop ──────────────────────────────────────────────────
    const messages = [
      { role: 'user', content: initialMessage },
    ];

    const SAFETY_LIMIT = 60;
    const ERROR_STREAK_LIMIT = 3;  // abort if same error repeats this many times
    const TOTAL_ERROR_LIMIT  = 12; // abort if total tool errors exceed this
    let toolCallCount  = 0;
    let totalErrors    = 0;
    let done           = false;
    let consecutiveErrors = 0;
    let lastErrorMsg   = '';

    while (!done && toolCallCount < SAFETY_LIMIT) {
      addLog(runId, `Calling LLM (turn ${toolCallCount + 1})...`);

      const response = await callLLM({ systemText: systemPrompt, messages, tools });

      // Append assistant response to conversation
      messages.push({ role: 'assistant', content: response.content });

      // Process each content block
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          addLog(runId, `Claude: ${block.text.slice(0, 200)}`);
        }

        if (block.type !== 'tool_use') continue;

        toolCallCount++;
        const { id: toolUseId, name: toolName, input } = block;
        addLog(runId, `Tool call: ${toolName} (${JSON.stringify(input).slice(0, 100)})`);

        let toolResult;

        try {
          if (toolName === 'take_screenshot') {
            await page.screenshot({ type: 'png' }); // always take it (visible window)
            if (shouldUseApi('auto-apply')) {
              const screenshotBuffer = await page.screenshot({ type: 'png' });
              const base64 = screenshotBuffer.toString('base64');
              toolResult = {
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } }],
              };
            } else {
              // Ollama text model — return page text instead of image
              const pageText = await page.evaluate(() => document.body.innerText);
              toolResult = {
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: `[Text-mode screenshot — use get_page_text for content]\n${pageText.slice(0, 2000)}`,
              };
            }
            addLog(runId, 'Screenshot captured');

          } else if (toolName === 'get_interactive_elements') {
            const elements = await page.evaluate(() => {
              const results = [];
              const seen = new Set();

              function bestSelector(el) {
                if (el.id) return `#${el.id}`;
                if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
                if (el.getAttribute('data-id')) return `[data-id="${el.getAttribute('data-id')}"]`;
                // class-based fallback (first two classes)
                const cls = Array.from(el.classList).slice(0, 2).join('.');
                return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
              }

              // Inputs
              for (const el of document.querySelectorAll('input, textarea, select')) {
                const sel = bestSelector(el);
                if (seen.has(sel)) continue;
                seen.add(sel);
                results.push({
                  tag: el.tagName.toLowerCase(),
                  selector: sel,
                  type: el.type || null,
                  name: el.name || null,
                  placeholder: el.placeholder || null,
                  label: el.labels?.[0]?.textContent?.trim() || null,
                  value: el.value ? '[has value]' : null,
                });
              }

              // Buttons and submit-like links
              for (const el of document.querySelectorAll('button, [role="button"], a[href], input[type="submit"]')) {
                const text = el.textContent?.trim().slice(0, 60);
                const ariaLabel = el.getAttribute('aria-label');
                if (!text && !ariaLabel) continue;
                const sel = bestSelector(el);
                if (seen.has(sel)) continue;
                seen.add(sel);
                results.push({
                  tag: el.tagName.toLowerCase(),
                  selector: sel,
                  type: el.type || el.getAttribute('role') || null,
                  text: text || ariaLabel,
                  ariaLabel: ariaLabel || null,
                });
              }

              return results.slice(0, 40); // cap at 40 elements
            });

            const summary = elements.map(e => {
              const parts = [`[${e.tag}]`, `selector: ${e.selector}`];
              if (e.type)        parts.push(`type=${e.type}`);
              if (e.name)        parts.push(`name=${e.name}`);
              if (e.placeholder) parts.push(`placeholder="${e.placeholder}"`);
              if (e.label)       parts.push(`label="${e.label}"`);
              if (e.text)        parts.push(`text="${e.text}"`);
              if (e.ariaLabel)   parts.push(`aria-label="${e.ariaLabel}"`);
              return parts.join('  ');
            }).join('\n');

            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: summary || 'No interactive elements found on this page.',
            };
            addLog(runId, `Found ${elements.length} interactive elements`);

          } else if (toolName === 'click_element') {
            // Accept common aliases small models use instead of 'selector'
            const clickSel = input.selector || input.element_id || input.xpath || input.id
              ? (input.selector || input.element_id || input.xpath || (input.id ? `#${input.id}` : null))
              : null;
            if (clickSel) {
              try {
                await page.click(clickSel, { timeout: 5000 });
              } catch {
                throw new Error(
                  `Selector "${clickSel}" not found. Use get_page_text to find the correct selector, then try again.`
                );
              }
            } else if (input.x !== undefined && input.y !== undefined) {
              await page.mouse.click(input.x, input.y);
            } else {
              throw new Error('click_element requires "selector" (CSS selector) or "x"/"y" coordinates');
            }
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: 'Clicked successfully',
            };

          } else if (toolName === 'type_text') {
            await page.keyboard.type(input.text);
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Typed: ${input.text.slice(0, 50)}`,
            };

          } else if (toolName === 'fill_input') {
            // Accept common selector aliases small models hallucinate
            const fillSel = input.selector || input.element_id || input.xpath
              || (input.name ? `[name="${input.name}"]` : null)
              || (input.id   ? `#${input.id}` : null);
            // Accept common value aliases
            const fillVal = input.value ?? input.text ?? input.content ?? input.data ?? null;

            if (!fillSel) {
              throw new Error(
                'fill_input requires "selector" (CSS selector, e.g. "#email" or "input[name=email]") ' +
                `AND "value". Received keys: ${Object.keys(input).join(', ')}. ` +
                'Example: fill_input({"selector": "input[name=email]", "value": "user@example.com"})'
              );
            }
            if (fillVal === null || fillVal === undefined) {
              throw new Error(
                'fill_input requires a "value" parameter. ' +
                `Received keys: ${Object.keys(input).join(', ')}. ` +
                'Example: fill_input({"selector": "input[name=email]", "value": "user@example.com"})'
              );
            }

            const value = fillVal === 'USE_STORED_PASSWORD' ? credentials.password : fillVal;
            // Short timeout so a bad selector fails fast
            try {
              // Auto-detect <select> vs text input — Playwright API differs
              const tagName = await page.$eval(fillSel, el => el.tagName.toLowerCase())
                .catch(() => 'input');
              if (tagName === 'select') {
                // Try label match first (e.g. "No"), fall back to value match
                await page.selectOption(fillSel, { label: String(value ?? '') }, { timeout: 5000 })
                  .catch(() => page.selectOption(fillSel, String(value ?? ''), { timeout: 5000 }));
              } else {
                await page.fill(fillSel, String(value ?? ''), { timeout: 5000 });
              }
            } catch (fillErr) {
              throw new Error(
                `Selector "${fillSel}" not found or not fillable. ` +
                'Use get_page_text to find the correct selector on the page, then try again.'
              );
            }
            const displayValue = fillVal === 'USE_STORED_PASSWORD' ? '***' : fillVal;
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Filled "${fillSel}" with "${displayValue}"`,
            };

          } else if (toolName === 'press_key') {
            await page.keyboard.press(input.key);
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Pressed key: ${input.key}`,
            };

          } else if (toolName === 'get_page_text') {
            const text = await page.evaluate(() => document.body.innerText);
            // Limit context fed to local models to reduce RAM pressure
            const limit = shouldUseApi('auto-apply') ? 4000 : 1500;
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: text.slice(0, limit),
            };

          } else if (toolName === 'navigate_to') {
            await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Navigated to: ${input.url}`,
            };
            addLog(runId, `Navigated to ${input.url}`);

          } else if (toolName === 'upload_resume') {
            await page.setInputFiles(input.selector, resumePath);
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: 'Resume uploaded successfully',
            };
            addLog(runId, 'Resume uploaded');

          } else if (toolName === 'done') {
            done = true;
            const entry = applyJobs.get(runId);
            if (entry) {
              entry.status = input.success ? 'complete' : 'error';
              entry.result = { success: input.success, message: input.message };
            }
            addLog(runId, `Done: ${input.success ? 'SUCCESS' : 'FAILED'} — ${input.message}`);

            // On success, upsert an "applied" Kanban card for this job
            if (input.success) {
              try {
                // If already in Kanban (any status), bump it to "applied"
                const { rows: existing } = await pool.query(
                  'SELECT id, status FROM applications WHERE user_id = $1 AND (job_id = $2 OR (url = $3 AND $3 IS NOT NULL))',
                  [profile.id, jobId || null, jobUrl || null]
                );
                if (existing.length) {
                  if (existing[0].status !== 'applied') {
                    await pool.query(
                      'UPDATE applications SET status = $1, applied_date = NOW(), updated_at = NOW() WHERE id = $2',
                      ['applied', existing[0].id]
                    );
                    addLog(runId, '📋 Kanban card moved to Applied');
                  } else {
                    addLog(runId, '📋 Already in Applied column');
                  }
                } else {
                  await pool.query(`
                    INSERT INTO applications
                      (user_id, job_id, title, company, location, url, source, status, applied_date, notes)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,'applied',NOW(),$8)
                  `, [
                    profile.id, jobId || null, jobTitle, jobCompany,
                    jobLocation || null, jobUrl, jobSource || null,
                    'Auto-applied via agent',
                  ]);
                  addLog(runId, '📋 Added to Kanban as Applied');
                }
              } catch (dbErr) {
                // Non-fatal — application was still submitted, just log the Kanban failure
                console.error('[AutoApply] Failed to create Kanban card:', dbErr.message);
                addLog(runId, `⚠️ Could not update Kanban: ${dbErr.message}`);
              }
            }

            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Job application ${input.success ? 'completed' : 'failed'}: ${input.message}`,
            };

          } else if (toolName === 'wait_for_human') {
            const reason = input.reason || 'Human action required';
            addLog(runId, `⏸️ Paused — ${reason}`);
            const entry = applyJobs.get(runId);
            if (entry) {
              entry.status = 'paused';
              entry.pauseReason = reason;
            }
            // Suspend until the /resume endpoint resolves this Promise
            await new Promise(resolve => {
              const e = applyJobs.get(runId);
              if (e) e.resumeResolve = resolve;
            });
            const e = applyJobs.get(runId);
            if (e) { e.status = 'running'; e.resumeResolve = null; e.pauseReason = null; }
            addLog(runId, '▶️ Resuming — take a screenshot to see the current state');
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: 'Human has completed the action. Call take_screenshot to see the current state and continue.',
            };

          } else {
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              is_error: true,
              content: `Unknown tool: ${toolName}`,
            };
          }
        } catch (toolErr) {
          addLog(runId, `Tool error (${toolName}): ${toolErr.message}`);
          const errMsg = toolErr.message;
          // Track consecutive identical errors — abort if model is stuck in a loop
          totalErrors++;
          if (errMsg === lastErrorMsg) {
            consecutiveErrors++;
          } else {
            consecutiveErrors = 1;
            lastErrorMsg = errMsg;
          }
          if (consecutiveErrors >= ERROR_STREAK_LIMIT || totalErrors >= TOTAL_ERROR_LIMIT) {
            const reason = consecutiveErrors >= ERROR_STREAK_LIMIT
              ? `same error repeated ${consecutiveErrors}x`
              : `${totalErrors} total tool errors`;
            addLog(runId, `Aborting: ${reason} — model is stuck`);
            done = true;
            const entry = applyJobs.get(runId);
            if (entry) {
              entry.status = 'error';
              entry.result = { success: false, message: `Agent stuck (${reason}): ${errMsg}` };
            }
          }
          toolResult = {
            type: 'tool_result',
            tool_use_id: toolUseId,
            is_error: true,
            content: `Error executing ${toolName}: ${errMsg}`,
          };
        }

        // Reset streak on any successful tool call
        if (!toolResult.is_error) consecutiveErrors = 0;
        toolResults.push(toolResult);
      }

      // If there were tool uses, send results back
      if (toolResults.length > 0 && !done) {
        messages.push({ role: 'user', content: toolResults });
      }

      // Model stopped without calling done — treat as error and nudge it
      if (response.stop_reason === 'end_turn' && !done) {
        // Give the model one chance to call done by asking it explicitly
        const lastText = response.content.find(b => b.type === 'text')?.text || '';
        addLog(runId, `Model stopped early: "${lastText.slice(0, 120)}"`);
        messages.push({ role: 'user', content: 'You stopped without calling the done tool. Call done now with success=true if the application was submitted, or success=false if you could not complete it.' });
        // Only do this once — next end_turn with no tool call truly exits
        if (messages.filter(m => m.content === 'You stopped without calling the done tool. Call done now with success=true if the application was submitted, or success=false if you could not complete it.').length > 1) {
          addLog(runId, 'Model repeatedly stopped without calling done — marking error');
          done = true;
          const entry = applyJobs.get(runId);
          if (entry) {
            entry.status = 'error';
            entry.result = { success: false, message: lastText || 'Agent stopped without completing the application' };
          }
        }
      }
    }

    // Safety limit hit
    if (!done && toolCallCount >= SAFETY_LIMIT) {
      addLog(runId, `Safety limit of ${SAFETY_LIMIT} tool calls reached`);
      const entry = applyJobs.get(runId);
      if (entry) {
        entry.status = 'error';
        entry.result = { success: false, message: `Safety limit of ${SAFETY_LIMIT} tool calls reached` };
      }
    }

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      addLog(runId, 'Browser closed');
    }

    // Ensure job is always marked as terminal
    const entry = applyJobs.get(runId);
    if (entry && entry.status === 'running') {
      entry.status = 'error';
      entry.result = { success: false, message: 'Agent exited unexpectedly' };
    }
  }
}

module.exports = { startApplyJob, applyJobs, createSession, hasSession, sessionPath };
