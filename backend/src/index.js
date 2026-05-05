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
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`JobHunt API running on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Database init failed:', err.message || err.code || err);
    console.error(err);
    process.exit(1);
  });
