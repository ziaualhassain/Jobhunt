const express = require('express');
const multer = require('multer');
const { extractText, analyzeResume, isOllamaAvailable } = require('../services/resumeAnalyzer');

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

module.exports = router;
