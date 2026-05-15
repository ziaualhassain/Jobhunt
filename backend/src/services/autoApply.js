'use strict';

// NOTE: Before using this service, run:
//   npx playwright install chromium
// This downloads the Chromium browser (~200MB) needed for automation.

const { chromium } = require('playwright');
const { callLLM, useAnthropic, OLLAMA_MODEL, OLLAMA_BASE } = require('./llmProvider');

// Log which LLM will be used at startup
if (useAnthropic()) {
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
 * @param {object} opts.profile      - User profile (name, email, preferences.applicationProfile, skills)
 * @param {object} opts.credentials  - { email, password } for the job site
 * @param {string} opts.resumePath   - Absolute path to the resume file on disk
 */
async function startApplyJob({ runId, jobUrl, jobTitle, jobCompany, profile, credentials, resumePath }) {
  // Initialise the job entry
  applyJobs.set(runId, { status: 'running', logs: [], result: null });
  addLog(runId, `Starting apply job for ${jobTitle} at ${jobCompany}`);

  // Run the agent loop in the background (do not await here)
  _runAgentLoop({ runId, jobUrl, jobTitle, jobCompany, profile, credentials, resumePath })
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

async function _runAgentLoop({ runId, jobUrl, jobTitle, jobCompany, profile, credentials, resumePath }) {
  const appProfile = (profile.preferences && profile.preferences.applicationProfile) || {};
  const skills = profile.skills || [];

  let browser = null;
  let page = null;

  try {
    const provider = useAnthropic()
      ? 'Anthropic claude-opus-4-7'
      : `Ollama ${OLLAMA_MODEL} @ ${OLLAMA_BASE}`;
    addLog(runId, `LLM provider: ${provider}`);

    addLog(runId, 'Launching browser...');
    // Run headless when using a local Ollama model to save RAM (no need to watch a text-based agent)
    browser = await chromium.launch({ headless: !useAnthropic() });
    const context = await browser.newContext();
    page = await context.newPage();

    addLog(runId, `Navigating to ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // ─── System prompt ───────────────────────────────────────────────────────
    const usingAnthropic = useAnthropic();
    const systemPrompt = `You are a job application agent. You control a web browser via tools. \
Your goal: submit a job application for the candidate using their profile data. \
Work step by step — ${usingAnthropic ? 'take a screenshot first to see the page, then' : 'use get_page_text to read the page, then'} decide what to do. \
Be methodical: fill out every required field, upload the resume when prompted, and click \
Submit/Apply when all fields are complete. When you are done (success or permanent failure), \
call the done tool.`;

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

Credentials for this site: email=${credentials.email}
(Password will be auto-filled by the system when you use fill_input with value "USE_STORED_PASSWORD")

Start by taking a screenshot to see the page.`;

    // ─── Tool definitions ────────────────────────────────────────────────────
    const tools = [
      {
        name: 'take_screenshot',
        description: 'Take a screenshot of the current browser page and return it as an image.',
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
        description: 'Fill an input field by CSS selector with a given value. Use value "USE_STORED_PASSWORD" to fill in the stored password.',
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
    ];

    // ─── Agent message loop ──────────────────────────────────────────────────
    const messages = [
      { role: 'user', content: initialMessage },
    ];

    const SAFETY_LIMIT = 30;
    let toolCallCount = 0;
    let done = false;

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
            if (useAnthropic()) {
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

          } else if (toolName === 'click_element') {
            if (input.selector) {
              await page.click(input.selector, { timeout: 10000 });
            } else if (input.x !== undefined && input.y !== undefined) {
              await page.mouse.click(input.x, input.y);
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
            const value = input.value === 'USE_STORED_PASSWORD' ? credentials.password : input.value;
            await page.fill(input.selector, value, { timeout: 10000 });
            const displayValue = input.value === 'USE_STORED_PASSWORD' ? '***' : input.value;
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Filled "${input.selector}" with "${displayValue}"`,
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
            const limit = useAnthropic() ? 4000 : 1500;
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
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: `Job application ${input.success ? 'completed' : 'failed'}: ${input.message}`,
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
          toolResult = {
            type: 'tool_result',
            tool_use_id: toolUseId,
            is_error: true,
            content: `Error executing ${toolName}: ${toolErr.message}`,
          };
        }

        toolResults.push(toolResult);
      }

      // If there were tool uses, send results back
      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      // If Claude stopped naturally with no tool calls and didn't call done
      if (response.stop_reason === 'end_turn' && !done) {
        addLog(runId, 'Claude finished without calling done — marking complete');
        done = true;
        const entry = applyJobs.get(runId);
        if (entry) {
          entry.status = 'complete';
          entry.result = { success: false, message: 'Agent completed without explicit confirmation' };
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

module.exports = { startApplyJob, applyJobs };
