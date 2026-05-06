const express = require('express');
const multer = require('multer');
const { extractText, analyzeResume, enhanceResume, rewriteResume, isOllamaAvailable } = require('../services/resumeAnalyzer');
const { generateResumePdf } = require('../services/resumePdf');
const { generateResumeLatex } = require('../services/resumeLatex');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_, file, cb) {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, or TXT files are accepted'));
  },
});

// GET /api/resume/status — tells the frontend which backend is available
router.get('/status', async (req, res) => {
  if (process.env.ANTHROPIC_API_KEY) {
    return res.json({ available: true, backend: 'claude' });
  }
  const ollama = await isOllamaAvailable();
  if (ollama) {
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    return res.json({ available: true, backend: 'ollama', model });
  }
  res.json({ available: false, backend: null });
});

// POST /api/resume/analyze
router.post('/analyze', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const text = await extractText(req.file.buffer, req.file.mimetype);
    if (!text || text.trim().length < 50) {
      return res.status(422).json({ error: 'Could not extract enough text from the file' });
    }

    const analysis = await analyzeResume(text);
    res.json({ analysis, filename: req.file.originalname });
  } catch (err) {
    console.error('[Resume] analysis failed:', err.message);

    if (err.message === 'NO_BACKEND') {
      return res.status(503).json({
        error: 'No AI backend configured. Set ANTHROPIC_API_KEY in backend/.env, or install Ollama (ollama.com) and run: ollama pull llama3.2',
      });
    }
    if (err.status === 401) {
      return res.status(503).json({ error: 'Invalid Anthropic API key' });
    }
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Ollama is not running. Start it with: ollama serve' });
    }
    res.status(500).json({ error: err.message || 'Resume analysis failed' });
  }
});

// POST /api/resume/enhance
router.post('/enhance', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const targetRole = (req.body.targetRole || '').trim();
  const targetSkills = (req.body.targetSkills || '').trim();
  if (!targetRole) return res.status(400).json({ error: 'targetRole is required' });

  try {
    const text = await extractText(req.file.buffer, req.file.mimetype);
    if (!text || text.trim().length < 50) {
      return res.status(422).json({ error: 'Could not extract enough text from the file' });
    }
    const result = await enhanceResume(text, targetRole, targetSkills);
    res.json(result);
  } catch (err) {
    console.error('[Resume Enhance] failed:', err.message);
    if (err.message === 'NO_BACKEND') {
      return res.status(503).json({
        error: 'No AI backend configured. Set ANTHROPIC_API_KEY in backend/.env, or install Ollama (ollama.com) and run: ollama pull llama3.2',
      });
    }
    if (err.status === 401) return res.status(503).json({ error: 'Invalid Anthropic API key' });
    res.status(500).json({ error: err.message || 'Resume enhancement failed' });
  }
});

// POST /api/resume/rewrite
router.post('/rewrite', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const targetRole = (req.body.targetRole || '').trim();
  if (!targetRole) return res.status(400).json({ error: 'targetRole is required' });

  const achievements = (req.body.achievements || '').trim();
  const projects     = (req.body.projects || '').trim();
  const extraSkills  = (req.body.extraSkills || '').trim();
  const targetSkills = (req.body.targetSkills || '').trim();
  let missingKeywords = [];
  try { missingKeywords = JSON.parse(req.body.missingKeywords || '[]'); } catch {}

  try {
    const text = await extractText(req.file.buffer, req.file.mimetype);
    if (!text || text.trim().length < 50)
      return res.status(422).json({ error: 'Could not extract enough text from the file' });

    const result = await rewriteResume(text, targetRole, targetSkills, achievements, projects, extraSkills, missingKeywords);
    res.json(result);
  } catch (err) {
    console.error('[Resume Rewrite] failed:', err.message);
    if (err.message === 'NO_BACKEND')
      return res.status(503).json({ error: 'No AI backend configured. Install Ollama or set ANTHROPIC_API_KEY.' });
    if (err.status === 401) return res.status(503).json({ error: 'Invalid Anthropic API key' });
    res.status(500).json({ error: err.message || 'Resume rewrite failed' });
  }
});

// POST /api/resume/pdf — generates an ATS-friendly text-based PDF from JSON resume data
router.post('/pdf', async (req, res) => {
  try {
    const resume = req.body;
    if (!resume || !resume.name) return res.status(400).json({ error: 'Invalid resume data' });
    const buffer = await generateResumePdf(resume);
    const filename = `${(resume.name || 'resume').replace(/\s+/g, '_')}_resume.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[Resume PDF]', err.message);
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
});

// POST /api/resume/latex — generates Jake's Resume LaTeX source (.tex) from JSON resume data
router.post('/latex', async (req, res) => {
  try {
    const resume = req.body;
    if (!resume || !resume.name) return res.status(400).json({ error: 'Invalid resume data' });
    const latex = generateResumeLatex(resume);
    const filename = `${(resume.name || 'resume').replace(/\s+/g, '_')}_resume.tex`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(latex);
  } catch (err) {
    console.error('[Resume LaTeX]', err.message);
    res.status(500).json({ error: err.message || 'LaTeX generation failed' });
  }
});

module.exports = router;
