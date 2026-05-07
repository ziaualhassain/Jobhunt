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

// ─── Resume Enhancer ────────────────────────────────────────────────────────

const ENHANCE_SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) analyst and resume coach.
Analyze the provided resume against the candidate's target role and required skills.
Score sections fairly (0-100). Be honest — only give high scores for genuinely strong sections.
Provide specific, actionable feedback. Identify real issues and concrete improvements.`;

const ENHANCE_JSON_TEMPLATE = `Return ONLY a JSON object with this exact structure:
{
  "overall_score": <number 0-100>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "sections": {
    "ats_compatibility":       { "score": <number>, "feedback": "<string>" },
    "keyword_match":           { "score": <number>, "matched": ["<skill>"], "missing": ["<skill>"], "feedback": "<string>" },
    "experience_presentation": { "score": <number>, "feedback": "<string>" },
    "skills_section":          { "score": <number>, "feedback": "<string>" },
    "quantification":          { "score": <number>, "feedback": "<string>" }
  },
  "issues": [{ "severity": <"high"|"medium"|"low">, "title": "<string>", "detail": "<string>" }],
  "improvements": [{ "priority": <number>, "action": "<string>", "impact": "<string>" }],
  "summary": "<one sentence>"
}`;

async function enhanceWithClaude(resumeText, targetRole, targetSkills) {
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

async function enhanceWithOllama(resumeText, targetRole, targetSkills) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model,
      format: 'json',
      stream: false,
      messages: [
        { role: 'system', content: `${ENHANCE_SYSTEM_PROMPT}\n\n${ENHANCE_JSON_TEMPLATE}` },
        {
          role: 'user',
          content: `Target Role: ${targetRole}\nRequired Skills / Keywords: ${targetSkills}\n\nResume:\n${resumeText.slice(0, 8000)}`,
        },
      ],
      options: { temperature: 0.1 },
    },
    { timeout: 180_000 },
  );

  const content = response.data?.message?.content;
  if (!content) throw new Error('Empty response from Ollama');
  return JSON.parse(content);
}

async function enhanceResume(resumeText, targetRole, targetSkills) {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Resume Enhance] Using Claude API');
    return enhanceWithClaude(resumeText, targetRole, targetSkills);
  }
  if (await isOllamaAvailable()) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    console.log(`[Resume Enhance] Using Ollama (${model})`);
    return enhanceWithOllama(resumeText, targetRole, targetSkills);
  }
  throw new Error('NO_BACKEND');
}

// ─── Resume Rewriter ─────────────────────────────────────────────────────────

const REWRITE_SYSTEM = `You are an expert resume writer and ATS optimization specialist.
Rewrite the provided resume into a polished, ATS-optimized document.
Rules:
- Start every bullet point with a strong past-tense action verb (Led, Built, Reduced, Delivered, Designed…)
- Quantify achievements wherever possible (%, $, time saved, team size, scale)
- Make the professional summary keyword-rich for the target role
- Incorporate the user's provided achievements and missing keywords naturally
- Each experience entry: 4–6 bullet points focused on impact, not tasks
- Extract contact details (name, email, phone, etc.) directly from the original resume`;

const REWRITE_JSON_TEMPLATE = `Return ONLY this JSON object (no markdown, no extra text):
{
  "name": "full name from original resume",
  "contact": {
    "email": "email or empty string",
    "phone": "phone or empty string",
    "location": "city, country or empty string",
    "linkedin": "linkedin URL or empty string",
    "github": "github URL or empty string",
    "website": "portfolio URL or empty string"
  },
  "summary": "2-3 sentence ATS-optimized professional summary mentioning target role and key skills",
  "experience": [
    {
      "title": "job title",
      "company": "company name",
      "location": "city, country",
      "period": "Month Year – Month Year or Present",
      "bullets": ["strong action-verb bullet with metric", "another bullet"]
    }
  ],
  "skills": ["skill1", "skill2"],
  "education": [{ "degree": "degree name", "institution": "institution", "year": "year" }],
  "projects": [{ "name": "project name", "description": "what it does and its impact", "tech": "comma-separated tech stack" }],
  "certifications": ["certification name"]
}`;

async function rewriteWithOllama(resumeText, targetRole, targetSkills, achievements, projects, extraSkills, missingKeywords) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const userMsg = [
    `Target Role: ${targetRole}`,
    targetSkills ? `Target Skills: ${targetSkills}` : '',
    missingKeywords?.length ? `Missing Keywords to incorporate: ${missingKeywords.join(', ')}` : '',
    achievements ? `\nUser-provided achievements:\n${achievements}` : '',
    projects ? `\nNotable projects to include:\n${projects}` : '',
    extraSkills ? `\nAdditional skills/certifications to add:\n${extraSkills}` : '',
    `\nOriginal Resume:\n${resumeText.slice(0, 8000)}`,
    `\n${REWRITE_JSON_TEMPLATE}`,
  ].filter(Boolean).join('\n');

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model,
      format: 'json',
      stream: false,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      options: { temperature: 0.3 },
    },
    { timeout: 240_000 }
  );

  const content = response.data?.message?.content;
  if (!content) throw new Error('Empty response from Ollama');
  return JSON.parse(content);
}

async function rewriteWithClaude(resumeText, targetRole, targetSkills, achievements, projects, extraSkills, missingKeywords) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contactSchema = {
    type: 'object',
    properties: {
      email: { type: 'string' }, phone: { type: 'string' },
      location: { type: 'string' }, linkedin: { type: 'string' },
      github: { type: 'string' }, website: { type: 'string' },
    },
    required: ['email', 'phone', 'location', 'linkedin', 'github', 'website'],
    additionalProperties: false,
  };

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      contact: contactSchema,
      summary: { type: 'string' },
      experience: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' }, company: { type: 'string' },
            location: { type: 'string' }, period: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'company', 'location', 'period', 'bullets'],
          additionalProperties: false,
        },
      },
      skills: { type: 'array', items: { type: 'string' } },
      education: {
        type: 'array',
        items: {
          type: 'object',
          properties: { degree: { type: 'string' }, institution: { type: 'string' }, year: { type: 'string' } },
          required: ['degree', 'institution', 'year'],
          additionalProperties: false,
        },
      },
      projects: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, description: { type: 'string' }, tech: { type: 'string' } },
          required: ['name', 'description', 'tech'],
          additionalProperties: false,
        },
      },
      certifications: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'contact', 'summary', 'experience', 'skills', 'education', 'projects', 'certifications'],
    additionalProperties: false,
  };

  const userMsg = [
    `Target Role: ${targetRole}`,
    targetSkills ? `Target Skills: ${targetSkills}` : '',
    missingKeywords?.length ? `Missing Keywords to incorporate: ${missingKeywords.join(', ')}` : '',
    achievements ? `\nUser-provided achievements:\n${achievements}` : '',
    projects ? `\nNotable projects to include:\n${projects}` : '',
    extraSkills ? `\nAdditional skills/certifications:\n${extraSkills}` : '',
    `\nOriginal Resume:\n${resumeText.slice(0, 12000)}`,
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: REWRITE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
    output_config: { format: { type: 'json_schema', json_schema: { name: 'resume_rewrite', schema } } },
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(textBlock.text);
}

async function rewriteResume(resumeText, targetRole, targetSkills, achievements, projects, extraSkills, missingKeywords) {
  if (await isOllamaAvailable()) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    console.log(`[Resume Rewrite] Using Ollama (${model})`);
    return rewriteWithOllama(resumeText, targetRole, targetSkills, achievements, projects, extraSkills, missingKeywords);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Resume Rewrite] Using Claude API');
    return rewriteWithClaude(resumeText, targetRole, targetSkills, achievements, projects, extraSkills, missingKeywords);
  }
  throw new Error('NO_BACKEND');
}

// ─── Resume Structure Extractor ──────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a resume data extraction specialist.
Extract all information from the provided resume text VERBATIM — do not rewrite, improve, or add any content that isn't in the original.
If a field is not present in the resume, return an empty string or empty array as appropriate.`;

async function extractStructuredWithClaude(resumeText) {
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contactSchema = {
    type: 'object',
    properties: {
      email: { type: 'string' }, phone: { type: 'string' },
      location: { type: 'string' }, linkedin: { type: 'string' },
      github: { type: 'string' }, website: { type: 'string' },
    },
    required: ['email', 'phone', 'location', 'linkedin', 'github', 'website'],
    additionalProperties: false,
  };

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      contact: contactSchema,
      summary: { type: 'string' },
      experience: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' }, company: { type: 'string' },
            location: { type: 'string' }, period: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'company', 'location', 'period', 'bullets'],
          additionalProperties: false,
        },
      },
      skills: { type: 'array', items: { type: 'string' } },
      education: {
        type: 'array',
        items: {
          type: 'object',
          properties: { degree: { type: 'string' }, institution: { type: 'string' }, year: { type: 'string' } },
          required: ['degree', 'institution', 'year'],
          additionalProperties: false,
        },
      },
      projects: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, description: { type: 'string' }, tech: { type: 'string' } },
          required: ['name', 'description', 'tech'],
          additionalProperties: false,
        },
      },
      certifications: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'contact', 'summary', 'experience', 'skills', 'education', 'projects', 'certifications'],
    additionalProperties: false,
  };

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Extract all information from this resume exactly as written:\n\n${resumeText.slice(0, 12000)}` }],
    output_config: { format: { type: 'json_schema', json_schema: { name: 'resume_extract', schema } } },
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(textBlock.text);
}

async function extractStructuredWithOllama(resumeText) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const template = `Return ONLY this JSON object (no markdown, no extra text):
{
  "name": "full name",
  "contact": { "email": "", "phone": "", "location": "", "linkedin": "", "github": "", "website": "" },
  "summary": "professional summary if present, else empty string",
  "experience": [{ "title": "", "company": "", "location": "", "period": "", "bullets": [""] }],
  "skills": ["skill1"],
  "education": [{ "degree": "", "institution": "", "year": "" }],
  "projects": [{ "name": "", "description": "", "tech": "" }],
  "certifications": [""]
}`;

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model,
      format: 'json',
      stream: false,
      messages: [
        { role: 'system', content: `${EXTRACT_SYSTEM}\n\n${template}` },
        { role: 'user', content: `Extract from this resume verbatim:\n\n${resumeText.slice(0, 8000)}` },
      ],
      options: { temperature: 0.1 },
    },
    { timeout: 180_000 }
  );

  const content = response.data?.message?.content;
  if (!content) throw new Error('Empty response from Ollama');
  return JSON.parse(content);
}

async function extractStructured(resumeText) {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Resume Extract] Using Claude API');
    return extractStructuredWithClaude(resumeText);
  }
  if (await isOllamaAvailable()) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    console.log(`[Resume Extract] Using Ollama (${model})`);
    return extractStructuredWithOllama(resumeText);
  }
  throw new Error('NO_BACKEND');
}

module.exports = { extractText, analyzeResume, enhanceResume, rewriteResume, extractStructured, isOllamaAvailable };
