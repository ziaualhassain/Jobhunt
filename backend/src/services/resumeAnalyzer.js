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

// ─── Resume Enhancer (Claude only) ─────────────────────────────────────────

const ENHANCE_SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) analyst and resume coach.
Analyze the provided resume against the candidate's target role and required skills.
Score sections fairly (0-100). Be honest — only give high scores for genuinely strong sections.
Provide specific, actionable feedback. Identify real issues and concrete improvements.`;

async function enhanceResume(resumeText, targetRole, targetSkills) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const schema = {
    type: 'object',
    properties: {
      overall_score: { type: 'number' },
      grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
      sections: {
        type: 'object',
        properties: {
          ats_compatibility:        { type: 'object', properties: { score: { type: 'number' }, feedback: { type: 'string' } }, required: ['score', 'feedback'], additionalProperties: false },
          keyword_match:            { type: 'object', properties: { score: { type: 'number' }, matched: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } }, feedback: { type: 'string' } }, required: ['score', 'matched', 'missing', 'feedback'], additionalProperties: false },
          experience_presentation:  { type: 'object', properties: { score: { type: 'number' }, feedback: { type: 'string' } }, required: ['score', 'feedback'], additionalProperties: false },
          skills_section:           { type: 'object', properties: { score: { type: 'number' }, feedback: { type: 'string' } }, required: ['score', 'feedback'], additionalProperties: false },
          quantification:           { type: 'object', properties: { score: { type: 'number' }, feedback: { type: 'string' } }, required: ['score', 'feedback'], additionalProperties: false },
        },
        required: ['ats_compatibility', 'keyword_match', 'experience_presentation', 'skills_section', 'quantification'],
        additionalProperties: false,
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            title: { type: 'string' },
            detail: { type: 'string' },
          },
          required: ['severity', 'title', 'detail'],
          additionalProperties: false,
        },
      },
      improvements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            priority: { type: 'number' },
            action: { type: 'string' },
            impact: { type: 'string' },
          },
          required: ['priority', 'action', 'impact'],
          additionalProperties: false,
        },
      },
      summary: { type: 'string' },
    },
    required: ['overall_score', 'grade', 'sections', 'issues', 'improvements', 'summary'],
    additionalProperties: false,
  };

  const userMessage = `Target Role: ${targetRole}
Required Skills / Keywords: ${targetSkills}

Resume:
${resumeText.slice(0, 12000)}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: ENHANCE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
    output_config: {
      format: { type: 'json_schema', json_schema: { name: 'resume_enhancement', schema } },
    },
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(textBlock.text);
}

module.exports = { extractText, analyzeResume, enhanceResume, isOllamaAvailable };
