'use strict';

/**
 * Thin LLM abstraction used by the auto-apply agent.
 *
 * - When ANTHROPIC_API_KEY is set → Anthropic claude-opus-4-7
 * - Otherwise → Ollama running at OLLAMA_BASE_URL (default http://localhost:11434)
 *               using model OLLAMA_MODEL (default llama3.1)
 *
 * Both paths return a normalised response object:
 *   { content: [...blocks], stop_reason: 'end_turn' | 'tool_use' }
 * where each block is either
 *   { type: 'text', text: string }
 * or
 *   { type: 'tool_use', id: string, name: string, input: object }
 */

const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'qwen2.5';

/**
 * Decide whether to use the Anthropic API for a given feature.
 *
 * Controls:
 *   USE_API_FOR_AUTO_APPLY=true|false  — governs the auto-apply agent
 *   USE_API=true|false                 — governs all other AI features
 *
 * If the relevant flag is not set, falls back to: use API when
 * ANTHROPIC_API_KEY is present, otherwise use Ollama.
 *
 * @param {'auto-apply'|'feature'} type
 */
function shouldUseApi(type = 'feature') {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const flag = type === 'auto-apply'
    ? process.env.USE_API_FOR_AUTO_APPLY
    : process.env.USE_API;

  if (flag === 'true')  return hasKey;
  if (flag === 'false') return false;
  return hasKey; // not set → backward-compat: use API if key exists
}

// Kept for internal use by callLLM
function useAnthropic() { return shouldUseApi('auto-apply'); }

// ── Ollama helpers ────────────────────────────────────────────────────────────

function anthropicToolsToOllama(tools) {
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

/**
 * Convert Anthropic-style messages → Ollama native /api/chat format.
 *
 * Key differences from OpenAI format:
 *  - assistant tool_calls have NO `id` or `type` field; arguments is an object (not string)
 *  - tool result messages use { role:'tool', content:'...' } with NO tool_call_id
 *  - assistant content must be '' not null when only tool_calls are present
 *  - images are replaced with a text note (most Ollama models are text-only)
 */
function anthropicMessagesToOllama(messages) {
  const out = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }

    const blocks = Array.isArray(msg.content) ? msg.content : [];

    if (msg.role === 'assistant') {
      const textParts = [];
      const toolCalls = [];

      for (const b of blocks) {
        if (b.type === 'text') {
          textParts.push(b.text);
        } else if (b.type === 'tool_use') {
          // Ollama native format: no id, no type, arguments is an object
          toolCalls.push({ function: { name: b.name, arguments: b.input || {} } });
        }
      }

      const m = { role: 'assistant', content: textParts.join('\n') || '' };
      if (toolCalls.length) m.tool_calls = toolCalls;
      out.push(m);

    } else if (msg.role === 'user') {
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      const textBlocks  = blocks.filter(b => b.type === 'text');
      const imageBlocks = blocks.filter(b => b.type === 'image');

      // Each tool result → { role: 'tool', content: '...' } — no tool_call_id in Ollama native
      for (const tr of toolResults) {
        let content;
        if (typeof tr.content === 'string') {
          content = tr.content;
        } else if (Array.isArray(tr.content)) {
          content = tr.content.map(b => {
            if (b.type === 'text')  return b.text;
            if (b.type === 'image') return '[screenshot — use get_page_text to read the page]';
            return '';
          }).filter(Boolean).join('\n');
        } else {
          content = 'done';
        }
        out.push({ role: 'tool', content: content || 'done' });
      }

      const parts = [
        ...textBlocks.map(b => b.text),
        ...imageBlocks.map(() => '[screenshot — use get_page_text to read the page]'),
      ].filter(Boolean);

      if (parts.length) out.push({ role: 'user', content: parts.join('\n') });
    }
  }

  return out;
}

/**
 * Normalise Ollama native /api/chat response → internal format.
 * Differences from OpenAI:
 *   - Top-level `message` key, not `choices[0].message`
 *   - `done_reason` instead of `finish_reason`
 *   - tool_calls[].function.arguments is already an object (not a JSON string)
 *   - tool_calls have no `id` — we generate one
 */
function ollamaToInternal(ollamaResponse) {
  const msg     = ollamaResponse.message || {};
  const content = [];

  if (msg.content) content.push({ type: 'text', text: msg.content });

  const { randomUUID } = require('crypto');
  for (const tc of (msg.tool_calls || [])) {
    const fn = tc.function || {};
    // arguments may be an object already or a JSON string
    let input = fn.arguments ?? {};
    if (typeof input === 'string') {
      try { input = JSON.parse(input); } catch { input = {}; }
    }
    content.push({ type: 'tool_use', id: randomUUID(), name: fn.name, input });
  }

  const stop_reason = (msg.tool_calls && msg.tool_calls.length) ? 'tool_use' : 'end_turn';
  return { content, stop_reason };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call the configured LLM.
 *
 * @param {object} opts
 * @param {string}   opts.systemText - Plain-text system prompt
 * @param {object[]} opts.messages   - Anthropic-format messages array (mutable — caller appends)
 * @param {object[]} opts.tools      - Anthropic tool definitions
 * @returns {Promise<{ content: object[], stop_reason: string }>}
 */
async function callLLM({ systemText, messages, tools }) {
  if (useAnthropic()) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    });

    return { content: response.content, stop_reason: response.stop_reason };

  } else {
    // Ollama native /api/chat endpoint (works on all Ollama versions)
    const axios = require('axios');

    const ollamaMessages = [
      { role: 'system', content: systemText },
      ...anthropicMessagesToOllama(messages),
    ];

    const payload = {
      model: OLLAMA_MODEL,
      messages: ollamaMessages,
      stream: false,
    };

    const ollamaTools = anthropicToolsToOllama(tools);
    if (ollamaTools.length) payload.tools = ollamaTools;

    let response;
    try {
      response = await axios.post(`${OLLAMA_BASE}/api/chat`, payload, { timeout: 120000 });
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Ollama model "${OLLAMA_MODEL}" not found. Run: ollama pull ${OLLAMA_MODEL}`);
      }
      if (err.response?.status === 400) {
        const detail = err.response?.data?.error || JSON.stringify(err.response?.data) || '';
        console.error('[llmProvider] Ollama 400 body:', detail);
        throw new Error(
          `Ollama rejected the request (400) for model "${OLLAMA_MODEL}".\n` +
          `If this is turn > 1, the model may not handle multi-turn tool calls correctly.\n` +
          `Try OLLAMA_MODEL=llama3.1 or mistral instead.\nDetail: ${detail}`
        );
      }
      if (err.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to Ollama at ${OLLAMA_BASE}. Make sure Ollama is running: ollama serve`);
      }
      throw err;
    }

    return ollamaToInternal(response.data);
  }
}

module.exports = { callLLM, shouldUseApi, useAnthropic, OLLAMA_MODEL, OLLAMA_BASE };
