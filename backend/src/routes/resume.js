const express = require('express');
const multer = require('multer');
const { extractText, analyzeResume } = require('../services/resumeAnalyzer');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_, file, cb) {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, or TXT files are accepted'));
    }
  },
});

// POST /api/resume/analyze
router.post('/analyze', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY is not configured. Set it in backend/.env to enable resume analysis.',
    });
  }

  try {
    const text = await extractText(req.file.buffer, req.file.mimetype);
    if (!text || text.trim().length < 50) {
      return res.status(422).json({ error: 'Could not extract enough text from the file' });
    }

    const analysis = await analyzeResume(text);
    res.json({ analysis, filename: req.file.originalname });
  } catch (err) {
    console.error('[Resume] analysis failed:', err.message);
    if (err.status === 401) {
      return res.status(503).json({ error: 'Invalid Anthropic API key' });
    }
    res.status(500).json({ error: err.message || 'Resume analysis failed' });
  }
});

module.exports = router;
