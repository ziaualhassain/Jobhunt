const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

function buildSystemPrompt(role, company, mode) {
  const ctx = [role && `Target Role: ${role}`, company && `Company: ${company}`]
    .filter(Boolean).join('\n');

  const modes = {
    mock:     'You are conducting a realistic mock interview. Ask one question at a time. After the candidate answers, give brief constructive feedback then ask the next question. Mix technical, behavioural, and situational questions. Start by introducing yourself briefly and asking the first question.',
    tips:     'You are an interview preparation coach. Give specific, actionable preparation tips for the role and company. Explain what interviewers look for, common pitfalls, and how to structure strong answers using frameworks like STAR.',
    practice: 'You are a practice interview partner. Help the candidate practise answering common questions. After each answer give detailed feedback on strengths and areas to improve. Suggest better phrasing or structure where needed.',
    technical:'You are a technical interviewer. Focus on coding challenges, system design, and technical concepts relevant to the role. Ask one problem at a time; hint if the candidate is stuck; explain the ideal solution afterwards.',
  };

  return `You are an expert interview coach for tech industry roles.${ctx ? '\n' + ctx : ''}

${modes[mode] || modes.practice}

Keep responses concise, practical, and encouraging. Never break character.`;
}

async function chatWithOllama(messages, role, company, mode) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model,
      stream: false,
      messages: [
        { role: 'system', content: buildSystemPrompt(role, company, mode) },
        ...messages,
      ],
      options: { temperature: 0.7 },
    },
    { timeout: 120_000 },
  );

  const content = response.data?.message?.content;
  if (!content) throw new Error('Empty response from Ollama');
  return content;
}

async function chatWithClaude(messages, role, company, mode) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: buildSystemPrompt(role, company, mode),
    messages,
  });

  return response.content.find(b => b.type === 'text')?.text ?? '';
}

async function isOllamaAvailable() {
  try {
    const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    await axios.get(`${baseUrl}/api/tags`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function chat(messages, role, company, mode) {
  if (await isOllamaAvailable()) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    console.log(`[Interview] Using Ollama (${model})`);
    return chatWithOllama(messages, role, company, mode);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Interview] Using Claude API');
    return chatWithClaude(messages, role, company, mode);
  }
  throw new Error('NO_BACKEND');
}

module.exports = { chat };
