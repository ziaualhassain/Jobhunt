const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  // plain text
  return buffer.toString('utf-8');
}

const SYSTEM_PROMPT = `You are an expert technical recruiter specializing in DevOps and Cloud infrastructure roles.
Analyze the provided resume text and extract structured information.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

async function analyzeResume(resumeText) {
  const schema = {
    type: 'object',
    properties: {
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Technical skills and tools found (e.g. Kubernetes, Terraform, AWS, Python)',
      },
      experienceLevel: {
        type: 'string',
        enum: ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal'],
        description: 'Estimated experience level based on years and responsibilities',
      },
      yearsOfExperience: {
        type: 'number',
        description: 'Approximate total years of relevant experience',
      },
      jobTitles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Suggested DevOps/Cloud job titles this person is suited for',
      },
      searchKeywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 8-12 lowercase keywords to use when searching for matching jobs',
      },
      cloudPlatforms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Cloud platforms mentioned (AWS, Azure, GCP, etc.)',
      },
      summary: {
        type: 'string',
        description: 'One sentence summary of this candidate for job matching purposes',
      },
    },
    required: ['skills', 'experienceLevel', 'yearsOfExperience', 'jobTitles', 'searchKeywords', 'cloudPlatforms', 'summary'],
    additionalProperties: false,
  };

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Analyze this resume and return a JSON object matching the schema exactly:\n\nRESUME:\n${resumeText.slice(0, 12000)}`,
      },
    ],
    output_config: {
      format: { type: 'json_schema', json_schema: { name: 'resume_analysis', schema } },
    },
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude');

  return JSON.parse(textBlock.text);
}

module.exports = { extractText, analyzeResume };
