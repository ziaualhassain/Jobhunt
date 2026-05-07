const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const xlsx = require('xlsx');
const mammoth = require('mammoth');

// ─── AI plan generation ──────────────────────────────────────────────────────

const PLAN_SYSTEM = `You are an expert interview preparation coach.
Generate a structured, realistic study plan as a JSON object.
Include only actionable tasks grouped by category. Be specific and practical.
For the resources field of every task, provide real direct URLs (https://...).
Use stable top-level or section URLs, not deep links that may break.
Good examples: "https://leetcode.com, https://neetcode.io, https://github.com/donnemartin/system-design-primer"
Never use plain names like "LeetCode" — always the full URL.`;

const PLAN_JSON_TEMPLATE = `Return ONLY a JSON object:
{
  "title": "<short plan title>",
  "goal": "<one sentence goal>",
  "categories": [
    {
      "name": "<category name>",
      "priority": "<high|medium|low>",
      "tasks": [
        {
          "title": "<task title>",
          "description": "<specific what to do>",
          "estimated_hours": <number>,
          "resources": "<comma-separated direct URLs, e.g. https://leetcode.com, https://docs.example.com>",
          "priority": "<high|medium|low>"
        }
      ]
    }
  ]
}`;

async function isOllamaAvailable() {
  try {
    const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    await axios.get(`${baseUrl}/api/tags`, { timeout: 2000 });
    return true;
  } catch { return false; }
}

async function generateWithOllama(role, company, timelineWeeks, focusAreas) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const prompt = `Create a ${timelineWeeks}-week interview preparation plan for a ${role} role${company ? ` at ${company}` : ''}.${focusAreas ? ` Focus on: ${focusAreas}.` : ''} Include 4-6 categories with 3-6 tasks each. ${PLAN_JSON_TEMPLATE}`;
  const res = await axios.post(`${baseUrl}/api/chat`, {
    model, format: 'json', stream: false,
    messages: [{ role: 'system', content: PLAN_SYSTEM }, { role: 'user', content: prompt }],
    options: { temperature: 0.4 },
  }, { timeout: 180_000 });
  const content = res.data?.message?.content;
  if (!content) throw new Error('Empty response from Ollama');
  return JSON.parse(content);
}

async function generateWithClaude(role, company, timelineWeeks, focusAreas) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      goal: { type: 'string' },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  estimated_hours: { type: 'number' },
                  resources: { type: 'string' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                },
                required: ['title', 'description', 'estimated_hours', 'resources', 'priority'],
                additionalProperties: false,
              },
            },
          },
          required: ['name', 'priority', 'tasks'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'goal', 'categories'],
    additionalProperties: false,
  };
  const res = await client.messages.create({
    model: 'claude-opus-4-7', max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: PLAN_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Create a ${timelineWeeks}-week interview preparation plan for a ${role} role${company ? ` at ${company}` : ''}.${focusAreas ? ` Focus on: ${focusAreas}.` : ''} Include 4-6 categories with 3-6 tasks each.` }],
    output_config: { format: { type: 'json_schema', json_schema: { name: 'prep_plan', schema } } },
  });
  return JSON.parse(res.content.find(b => b.type === 'text').text);
}

async function generatePlan(role, company, timelineWeeks, focusAreas) {
  if (await isOllamaAvailable()) {
    console.log('[Prep] Using Ollama');
    return generateWithOllama(role, company, timelineWeeks, focusAreas);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Prep] Using Claude');
    return generateWithClaude(role, company, timelineWeeks, focusAreas);
  }
  throw new Error('NO_BACKEND');
}

// ─── File parsing ────────────────────────────────────────────────────────────

function parseJson(buffer) {
  const data = JSON.parse(buffer.toString('utf-8'));
  // Support array of tasks or {tasks:[]} or {categories:[]}
  if (Array.isArray(data)) return flattenToTasks(data);
  if (Array.isArray(data.tasks)) return flattenToTasks(data.tasks);
  if (Array.isArray(data.categories)) {
    return data.categories.flatMap(cat =>
      (cat.tasks || []).map(t => ({ ...t, category: cat.name || 'General' }))
    );
  }
  return [];
}

function flattenToTasks(arr) {
  return arr.map(item => ({
    category: item.category || item.section || 'General',
    title: item.title || item.task || item.name || String(item),
    description: item.description || item.notes || '',
    estimated_hours: Number(item.estimated_hours || item.hours || item.time || 1),
    resources: item.resources || item.resource || item.link || '',
    priority: item.priority || 'medium',
  }));
}

function parseCsv(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return {
      category: obj.category || obj.section || obj.topic || 'General',
      title: obj.title || obj.task || obj.name || line,
      description: obj.description || obj.notes || '',
      estimated_hours: Number(obj.estimated_hours || obj.hours || 1),
      resources: obj.resources || obj.resource || '',
      priority: obj.priority || 'medium',
    };
  }).filter(t => t.title);
}

function parseXlsx(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
  return rows.map(row => {
    const lower = {};
    Object.keys(row).forEach(k => { lower[k.toLowerCase().replace(/\s+/g, '_')] = row[k]; });
    return {
      category: lower.category || lower.section || lower.topic || 'General',
      title: lower.title || lower.task || lower.name || '',
      description: lower.description || lower.notes || '',
      estimated_hours: Number(lower.estimated_hours || lower.hours || 1),
      resources: lower.resources || lower.resource || '',
      priority: lower.priority || 'medium',
    };
  }).filter(t => t.title);
}

async function parseDocx(buffer) {
  const { value: text } = await mammoth.extractRawText({ buffer });
  // Each non-empty line becomes a task
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 3).map(line => ({
    category: 'General',
    title: line.slice(0, 120),
    description: '',
    estimated_hours: 1,
    resources: '',
    priority: 'medium',
  }));
}

async function parseUpload(buffer, mimetype, originalname) {
  const ext = (originalname || '').split('.').pop()?.toLowerCase();
  if (mimetype === 'application/json' || ext === 'json') return parseJson(buffer);
  if (mimetype === 'text/csv' || ext === 'csv') return parseCsv(buffer);
  if (ext === 'xlsx' || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return parseXlsx(buffer);
  if (ext === 'xls' || mimetype === 'application/vnd.ms-excel') return parseXlsx(buffer);
  if (ext === 'docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return parseDocx(buffer);
  if (ext === 'txt' || mimetype === 'text/plain') return parseCsv(buffer); // treat as CSV-like
  throw new Error('Unsupported file type. Use JSON, CSV, XLSX, DOCX, or TXT.');
}

// ─── Convert chat message into structured plan ────────────────────────────────

const STRUCTURE_SYSTEM = `You are an expert interview preparation coach.
Convert the provided preparation advice or study plan text into a structured JSON plan.
Extract all topics, tasks, and activities. Group them into logical categories.
Be practical — if a week-by-week schedule is given, map each week to a category.
For the resources field of every task, always provide real direct URLs (https://...).
Never use plain names — always the full URL to the actual resource page.`;

async function structureFromMessageOllama(content, role, company) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const context = [role && `Role: ${role}`, company && `Company: ${company}`].filter(Boolean).join('\n');
  const prompt = `${context ? context + '\n\n' : ''}Convert the following into a structured preparation plan:\n\n${content.slice(0, 8000)}\n\n${PLAN_JSON_TEMPLATE}`;
  const res = await axios.post(`${baseUrl}/api/chat`, {
    model, format: 'json', stream: false,
    messages: [{ role: 'system', content: STRUCTURE_SYSTEM }, { role: 'user', content: prompt }],
    options: { temperature: 0.3 },
  }, { timeout: 180_000 });
  const text = res.data?.message?.content;
  if (!text) throw new Error('Empty response from Ollama');
  return JSON.parse(text);
}

async function structureFromMessageClaude(content, role, company) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      goal: { type: 'string' },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  estimated_hours: { type: 'number' },
                  resources: { type: 'string' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                },
                required: ['title', 'description', 'estimated_hours', 'resources', 'priority'],
                additionalProperties: false,
              },
            },
          },
          required: ['name', 'priority', 'tasks'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'goal', 'categories'],
    additionalProperties: false,
  };
  const context = [role && `Role: ${role}`, company && `Company: ${company}`].filter(Boolean).join('\n');
  const userMsg = `${context ? context + '\n\n' : ''}Convert the following preparation advice into a structured plan:\n\n${content.slice(0, 12000)}`;
  const res = await client.messages.create({
    model: 'claude-opus-4-7', max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: STRUCTURE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
    output_config: { format: { type: 'json_schema', json_schema: { name: 'prep_plan', schema } } },
  });
  return JSON.parse(res.content.find(b => b.type === 'text').text);
}

async function structureFromMessage(content, role, company) {
  if (await isOllamaAvailable()) {
    console.log('[Prep] Structuring chat message via Ollama');
    return structureFromMessageOllama(content, role, company);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Prep] Structuring chat message via Claude');
    return structureFromMessageClaude(content, role, company);
  }
  throw new Error('NO_BACKEND');
}

// ─── Task topic chat ──────────────────────────────────────────────────────────

async function chatAboutTask(messages, task) {
  const systemPrompt = [
    `You are an expert technical tutor helping someone prepare for a tech interview.`,
    `Topic: ${task.title}`,
    task.description ? `Context: ${task.description}` : '',
    task.resources  ? `Resources for this topic: ${task.resources}` : '',
    ``,
    `Guidelines:`,
    `- Explain concepts clearly with concise examples or pseudocode`,
    `- Ask a follow-up question after each answer to deepen understanding`,
    `- Suggest practice exercises or LeetCode-style problems when relevant`,
    `- Keep each response focused — 3–5 sentences max unless a code example is needed`,
    `- If the user seems stuck, break the concept into smaller steps`,
  ].filter(Boolean).join('\n');

  if (await isOllamaAvailable()) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const res = await axios.post(`${baseUrl}/api/chat`, {
      model, stream: false,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      options: { temperature: 0.7 },
    }, { timeout: 120_000 });
    const reply = res.data?.message?.content;
    if (!reply) throw new Error('Empty response from Ollama');
    return reply;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: 'claude-opus-4-7', max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    return res.content.find(b => b.type === 'text')?.text || '';
  }
  throw new Error('NO_BACKEND');
}

module.exports = { generatePlan, parseUpload, structureFromMessage, chatAboutTask };
