const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

// ─── Text extraction ────────────────────────────────────────────────────────

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf-8');
}

// ─── Shared prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert technical recruiter with broad knowledge of software engineering, web development, mobile, data, DevOps, and cloud roles.
Analyze the resume text and return ONLY a JSON object with these exact fields:
{
  "skills": ["list of technical skills, languages, frameworks, and tools"],
  "experienceLevel": "one of: Junior | Mid-level | Senior | Lead | Staff | Principal",
  "yearsOfExperience": <number>,
  "jobTitles": ["4-6 specific job titles this person is best suited for"],
  "searchKeywords": ["6-10 individual TECHNOLOGY or SKILL keywords only — use specific tech names like 'python', 'react', 'aws', 'blockchain', 'solidity', 'java', 'mysql', 'kubernetes'. Exclude all job titles, role names (developer, engineer, creator, researcher), soft skills, office tools, operating systems, and design tools. These keywords are sent directly to job board search APIs."],
  "cloudPlatforms": ["cloud platforms or infrastructure tools mentioned, empty array if none"],
  "summary": "one sentence summary of this person's profile for job matching"
}
Return ONLY the JSON object, no markdown, no explanation.`;

// ─── Claude API (Anthropic) ─────────────────────────────────────────────────

async function analyzeWithClaude(resumeText) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const schema = {
    type: 'object',
    properties: {
      skills: { type: 'array', items: { type: 'string' } },
      experienceLevel: { type: 'string', enum: ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal'] },
      yearsOfExperience: { type: 'number' },
      jobTitles: { type: 'array', items: { type: 'string' } },
      searchKeywords: { type: 'array', items: { type: 'string' } },
      cloudPlatforms: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
    },
    required: ['skills', 'experienceLevel', 'yearsOfExperience', 'jobTitles', 'searchKeywords', 'cloudPlatforms', 'summary'],
    additionalProperties: false,
  };

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Analyze this resume:\n\n${resumeText.slice(0, 12000)}` }],
    output_config: {
      format: { type: 'json_schema', json_schema: { name: 'resume_analysis', schema } },
    },
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(textBlock.text);
}

// ─── Ollama (local) ─────────────────────────────────────────────────────────

async function analyzeWithOllama(resumeText) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model,
      format: 'json',
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analyze this resume:\n\n${resumeText.slice(0, 8000)}` },
      ],
      options: { temperature: 0.1 },
    },
    { timeout: 120_000 }
  );

  const content = response.data?.message?.content;
  if (!content) throw new Error('Empty response from Ollama');
  return JSON.parse(content);
}

// ─── Check if Ollama is reachable ───────────────────────────────────────────

async function isOllamaAvailable() {
  try {
    const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    await axios.get(`${baseUrl}/api/tags`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Main entry point ───────────────────────────────────────────────────────

async function analyzeResume(resumeText) {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Resume] Using Claude API');
    return analyzeWithClaude(resumeText);
  }

  if (await isOllamaAvailable()) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    console.log(`[Resume] Using Ollama (${model})`);
    return analyzeWithOllama(resumeText);
  }

  throw new Error('NO_BACKEND');
}

module.exports = { extractText, analyzeResume, isOllamaAvailable };
