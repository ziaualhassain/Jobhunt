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
// llama3.2:1b is ~1.3 GB vs llama3.1's ~8 GB — much easier on a laptop
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'llama3.2:1b';

function useAnthropic() { return !!process.env.ANTHROPIC_API_KEY; }

// ── Ollama helpers ────────────────────────────────────────────────────────────

function anthropicToolsToOpenAI(tools) {
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

/**
 * Convert Anthropic-style messages (with content arrays, tool_use, tool_result,
 * and image blocks) into the flat OpenAI message array.
 *
 * Images are replaced with a text note because most Ollama models are text-only.
 */
function anthropicMessagesToOpenAI(messages) {
  const out = [];

  for (const msg of messages) {
    // Plain-string content — pass straight through
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
          toolCalls.push({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          });
        }
        // image blocks from assistant are ignored (shouldn't normally appear)
      }

      const m = { role: 'assistant', content: textParts.join('\n') || null };
      if (toolCalls.length) m.tool_calls = toolCalls;
      out.push(m);

    } else if (msg.role === 'user') {
      // Split into tool results (→ role:tool) and regular text/image blocks
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      const textBlocks  = blocks.filter(b => b.type === 'text');
      const imageBlocks = blocks.filter(b => b.type === 'image');

      // Tool results each get their own message
      for (const tr of toolResults) {
        let content;
        if (typeof tr.content === 'string') {
          content = tr.content;
        } else if (Array.isArray(tr.content)) {
          // Replace images with a placeholder; keep text
          content = tr.content.map(b => {
            if (b.type === 'text')  return b.text;
            if (b.type === 'image') return '[screenshot captured — use get_page_text to read the page]';
            return '';
          }).filter(Boolean).join('\n');
        } else {
          content = 'done';
        }
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: content || 'done' });
      }

      // Regular text + image blocks become a user message
      const parts = [
        ...textBlocks.map(b => b.text),
        ...imageBlocks.map(() => '[screenshot captured — use get_page_text to read the page]'),
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
      ...anthropicMessagesToOpenAI(messages),
    ];

    const payload = {
      model: OLLAMA_MODEL,
      messages: ollamaMessages,
      stream: false,
    };

    const oaiTools = anthropicToolsToOpenAI(tools);
    if (oaiTools.length) payload.tools = oaiTools;

    let response;
    try {
      response = await axios.post(`${OLLAMA_BASE}/api/chat`, payload, { timeout: 120000 });
    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Ollama model "${OLLAMA_MODEL}" not found. Run: ollama pull ${OLLAMA_MODEL}`);
      }
      if (err.response?.status === 400) {
        // Most common cause: model doesn't support tool calling
        const detail = err.response?.data?.error || '';
        throw new Error(
          `Ollama rejected the request (400) — "${OLLAMA_MODEL}" may not support tool calling.\n` +
          `Set OLLAMA_MODEL to a supported model (llama3.2:1b, llama3.1, mistral, qwen2.5).\n` +
          `Detail: ${detail}`
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

module.exports = { callLLM, useAnthropic, OLLAMA_MODEL, OLLAMA_BASE };
