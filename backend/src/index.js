const express = require('express');
const cors = require('cors');
const jobsRouter = require('./routes/jobs');
const applicationsRouter = require('./routes/applications');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`JobHunt API running on http://localhost:${PORT}`));
