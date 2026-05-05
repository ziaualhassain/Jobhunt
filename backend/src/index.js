require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');
const jobsRouter = require('./routes/jobs');
const applicationsRouter = require('./routes/applications');
const resumeRouter = require('./routes/resume');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/resume', resumeRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\nMissing required env vars: ${missing.join(', ')}`);
  console.error('Create backend/.env from backend/.env.example and fill in the values.\n');
  process.exit(1);
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`JobHunt API running on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('\nDatabase init failed!');
    console.error('  message:', err.message);
    console.error('  code:   ', err.code);
    console.error('  host:   ', process.env.DB_HOST);
    console.error('  port:   ', process.env.DB_PORT || 25881);
    console.error('  user:   ', process.env.DB_USER);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
