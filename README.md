# JobHunters — AI-Powered Job Search & Career Dashboard

A full-stack career platform for tech professionals. Search aggregated job listings, track your application pipeline, enhance your résumé with AI, practise interviews, and plan your prep — all in one place.

Built by **Team Insighters** · © 2026

---

## Features

### Job Listings
- Aggregates live jobs from **5 sources**: RemoteOK, We Work Remotely, Himalayas, ArbeitNow, and TheirStack
- **Smart filters** — keywords, location, role tags, frameworks, cloud tools, job type, experience level, remote toggle
- **Location-aware** — searching "Hyderabad" with remote OFF shows only city-specific jobs; remote ON includes remote jobs too
- **Persistent filters** — last search saved to your profile and restored on any device after login
- **Resume-powered search** — upload a PDF/DOCX résumé; AI extracts skills and auto-populates the search form
- Sort by title, company, or source

### Interview Tracker (Kanban)
- **Kanban board** with 7 columns: Saved → Applied → Phone Screen → Technical → Final Interview → Offer → Rejected
- Drag-and-drop cards between columns
- Manually add any job from any source
- Inline notes on each card, stats row showing counts per status

### Resume Creator & Enhancer
- **Analyse & Enhance** — upload a résumé, get AI-scored sections with improvement suggestions
- **Enhanced Rewrite** — AI extracts your résumé verbatim into a fully editable form, then rewrites it professionally
- **Create from scratch** — structured form for work experience, education, projects, and certifications
- **5 PDF templates**: Jake, Traditional, Clean, Technical, Compact
- Drag-and-drop file upload, one-click PDF download

### Interview Coach
- AI-powered mock interview sessions (practice or mock mode)
- Configurable company and role context
- Persistent session history with full conversation replay
- Mobile: list/chat toggle view

### Preparation Tracker
- AI-generated study plans based on goal, company, role, and timeline
- Tasks by category with priority levels and estimated hours
- Daily check-in streak tracking
- Per-task AI coaching chat
- Mobile: list/detail toggle view

### Auth & Profiles
- **Email/password** registration and login (JWT, 7-day expiry)
- **Social login** via Auth0 — Google, GitHub, and any provider enabled in your tenant
- Editable display name and bio
- Job preferences used as default search filters, synced across devices
- Sign-out from the profile page

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| State & Data | TanStack Query, React Router v6 |
| Auth | JWT · Auth0 (`@auth0/auth0-react`) · bcryptjs |
| Backend | Node.js, Express |
| Database | PostgreSQL (Aiven cloud) |
| AI | Claude Opus 4.7 (adaptive thinking) · Ollama (local fallback) |
| PDF Generation | pdfkit (5 templates) |
| Job Sources | RemoteOK, We Work Remotely, Himalayas, ArbeitNow, TheirStack |

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [Aiven PostgreSQL](https://aiven.io) instance (free tier works)
- Save your Aiven CA certificate to `backend/certs/aiven-ca.pem`
- (Optional) [Ollama](https://ollama.com) for free local AI

### 1. Clone

```bash
git clone https://github.com/ziaualhassain/Jobhunt.git
cd Jobhunt
```

### 2. Backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# ── PostgreSQL (Aiven) ────────────────────────────────────────────
DB_HOST=your-pg-host.aivencloud.com
DB_PORT=25881
DB_USER=avnadmin
DB_PASSWORD=your-password
DB_NAME=defaultdb

# ── JWT ──────────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-long-random-secret

# ── Claude API (optional) ─────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Ollama (optional — free local AI) ────────────────────────────
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434

# ── Auth0 (optional — social login) ──────────────────────────────
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# ── TheirStack (optional — India job cache) ───────────────────────
THEIRSTACK_API_KEY=your-key
REFRESH_THEIRSTACK=true

PORT=3001
```

### 3. Frontend environment

Create `frontend/.env`:

```env
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
```

### 4. Install & run

```bash
npm run install:all   # installs root + frontend + backend
npm run dev           # starts both concurrently
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |

The database schema is created and migrated automatically on first start.

---

## AI Setup

The backend auto-detects the available AI provider in priority order:

| Priority | Provider | How to enable |
|----------|----------|---------------|
| 1st | **Claude Opus 4.7** | Set `ANTHROPIC_API_KEY` in `backend/.env` |
| 2nd | **Ollama** | Run Ollama locally (see below) |
| — | Neither | Resume AI features disabled; everything else works |

### Ollama quick-start

```bash
# macOS
brew install ollama
ollama serve                # runs on http://localhost:11434

# Pull a model (choose one)
ollama pull llama3.2        # 2 GB — fast, good quality
ollama pull mistral         # 4 GB — better reasoning
```

No env var needed — the backend detects Ollama automatically at `http://localhost:11434`.

---

## Social Login (Auth0)

1. Create a **Single Page Application** in [Auth0 Dashboard](https://manage.auth0.com)
2. Set **Application Type** → **Single Page Application**
3. **Allowed Callback URLs**: `http://localhost:5173/callback`
4. **Allowed Logout URLs**: `http://localhost:5173`
5. **Allowed Web Origins**: `http://localhost:5173`
6. Enable social connections under **Authentication → Social**
7. Copy Domain + Client ID into both `.env` files above

---

## Deployment

### Frontend → Vercel (free)

```bash
cd frontend && vercel
```

Set in Vercel dashboard → Environment Variables:

| Variable | Value |
|----------|-------|
| `VITE_AUTH0_DOMAIN` | your Auth0 domain |
| `VITE_AUTH0_CLIENT_ID` | your Auth0 client ID |
| `VITE_API_URL` | `https://api.yourdomain.com/api` |

Add `frontend/vercel.json` for client-side routing:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### Backend + Ollama → VPS

Recommended: **Hetzner CX32** (€6.46/mo · 4 vCPU · 8 GB RAM) — enough for `llama3.2`.

```bash
# Install Node.js, PM2, Ollama, Nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx
npm install -g pm2
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2

# Deploy
git clone https://github.com/ziaualhassain/Jobhunt.git /srv/jobhunters
cd /srv/jobhunters/backend
cp .env.example .env   # fill in production values
npm install
pm2 start src/index.js --name jobhunters-api
pm2 save && pm2 startup
```

Nginx reverse proxy (`/etc/nginx/sites-available/jobhunters`):

```nginx
server {
    server_name api.yourdomain.com;
    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/jobhunters /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.yourdomain.com   # free SSL
```

Update Auth0 Allowed URLs to include your production domain.

---

## Job Sources

| Source | Type | API Key | Coverage |
|--------|------|---------|----------|
| RemoteOK | REST API | No | Worldwide remote |
| We Work Remotely | RSS | No | Worldwide remote |
| Himalayas | REST API | No | Worldwide remote |
| ArbeitNow | REST API | No | Worldwide, remote-filtered |
| TheirStack | REST API | Yes | India tech jobs, DB-cached |

TheirStack jobs are fetched on startup and refreshed every 6 hours in the background.

---

## Project Structure

```
Jobhunt/
├── frontend/
│   └── src/
│       ├── components/     JobCard, ApplicationCard, SearchForm, AddJobModal, …
│       ├── context/        AuthContext (JWT + Auth0 session management)
│       ├── pages/          JobsPage, TrackerPage, ResumeEnhancerPage,
│       │                   InterviewCoachPage, PrepTrackerPage,
│       │                   ProfilePage, LoginPage, RegisterPage, CallbackPage
│       ├── lib/api.ts      Axios client + all typed API functions
│       └── types/          Shared TypeScript interfaces
├── backend/
│   └── src/
│       ├── routes/         auth, jobs, applications, profile, resume, interview, prep
│       ├── services/       jobSources.js, resumeAnalyzer.js, theirStackSync.js
│       ├── db/             database.js (schema init + pg pool)
│       └── middleware/     auth.js (JWT + JWKS verification for Auth0)
├── package.json            root scripts: dev, install:all
└── README.md
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend concurrently |
| `npm run install:all` | Install all dependencies |
| `cd frontend && npm run build` | Production frontend build |
| `cd backend && npm start` | Backend only (production) |

---

*Made with ♥ by Team Insighters*
