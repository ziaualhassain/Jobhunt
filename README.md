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
- **For You** — personalised job feed based on your profile interests and keywords
- Sort by title, company, or source

### Auto-Apply Agent
- One-click AI agent that fills and submits job applications in a real browser
- Handles multi-page forms, dropdowns, screening questions, and file uploads
- Saves your job site session (cookies) so login and 2FA are skipped on future runs
- Runs **headless in the background** by default (`SHOW_BROWSER=false`) — no browser window opens
- Set `SHOW_BROWSER=true` to watch the browser and handle CAPTCHAs manually
- On success, automatically moves the job to the **Applied** column in the Kanban board

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

### Preparation Tracker
- AI-generated study plans based on goal, company, role, and timeline
- Tasks by category with priority levels and estimated hours
- Daily check-in streak tracking
- Per-task AI coaching chat

### Auth & Profiles
- **Email/password** registration and login (JWT, 7-day expiry)
- **Social login** via Auth0 — Google, GitHub, and any provider enabled in your tenant
- Editable display name and bio
- Job preferences and application questionnaire stored in your profile
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
| Browser Automation | Playwright (Chromium, headless by default) |
| PDF Generation | pdfkit (5 templates) |
| Job Sources | RemoteOK, We Work Remotely, Himalayas, ArbeitNow, TheirStack |

---

## Getting Started

Choose your setup path:

- **[Docker](#docker-setup-recommended)** — one command, no Node.js required locally
- **[Manual](#manual-setup)** — run frontend and backend directly with Node.js

---

## Docker Setup (Recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2
- An [Aiven PostgreSQL](https://aiven.io) instance (free tier works)
- Your Aiven CA certificate saved to `backend/certs/aiven-ca.pem`

### 1. Clone

```bash
git clone https://github.com/ziaualhassain/Jobhunt.git
cd Jobhunt
```

### 2. Backend secrets

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your real values (see the [Environment Variables](#environment-variables) reference below).

### 3. Frontend build vars

Vite bakes `VITE_*` variables into the JS bundle at build time, so they must be provided before `docker compose build`. Create a `.env` file at the **project root**:

```env
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_PERCENTAGE_ENABLE=true
```

### 4. Start

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| App (frontend + API) | http://localhost |
| Backend API (direct) | http://localhost:3001 |

The database schema is created automatically on first start.

> **Changing `VITE_*` vars?** Re-run `docker compose up --build` — the frontend image must be rebuilt to pick up the new values.

> **Ollama in Docker:** If you use a local Ollama install, set `OLLAMA_BASE_URL=http://host.docker.internal:11434` in `backend/.env` (Docker Desktop on Mac/Windows) or your host's LAN IP on Linux.

### Useful Docker commands

```bash
docker compose up -d            # start in detached (background) mode
docker compose logs -f backend  # stream backend logs
docker compose down             # stop containers (data volume preserved)
docker compose down -v          # stop and delete the uploads volume too
docker compose up --build       # rebuild images after a code change
```

### Persistent data

Uploaded resumes and saved browser sessions are stored in a named Docker volume (`uploads`) and survive `docker compose down`. Only `docker compose down -v` removes them.

---

## Manual Setup

### Prerequisites

- Node.js 20+
- An [Aiven PostgreSQL](https://aiven.io) instance (free tier works)
- Save your Aiven CA certificate to `backend/certs/aiven-ca.pem`
- (Optional) [Ollama](https://ollama.com) for free local AI

### 1. Clone

```bash
git clone https://github.com/ziaualhassain/Jobhunt.git
cd Jobhunt
```

### 2. Install dependencies

```bash
npm run install:all   # installs root + frontend + backend packages
```

### 3. Backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` — see [Environment Variables](#environment-variables) below.

### 4. Frontend environment

Create `frontend/.env`:

```env
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_PERCENTAGE_ENABLE=true
```

### 5. Run

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |

The database schema is created and migrated automatically on first start.

---

## Environment Variables

### `backend/.env`

```env
# ── PostgreSQL (Aiven) ────────────────────────────────────────────────────────
DB_HOST=your-pg-host.aivencloud.com
DB_PORT=25881
DB_USER=avnadmin
DB_PASSWORD=your-password
DB_NAME=defaultdb

# ── JWT ───────────────────────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-long-random-secret

# ── Claude API (optional) ─────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── AI backend selection ──────────────────────────────────────────────────────
USE_API=true                     # true → Claude API, false → Ollama
USE_API_FOR_AUTO_APPLY=true      # separate flag for the auto-apply agent

# ── Ollama (optional — free local AI) ─────────────────────────────────────────
OLLAMA_MODEL=qwen2.5
OLLAMA_BASE_URL=http://localhost:11434   # use host.docker.internal in Docker

# ── Auto-apply browser mode ───────────────────────────────────────────────────
SHOW_BROWSER=false   # false = headless background task (default)
                     # true  = open a visible browser window (for CAPTCHA handling)

# ── Auth0 (optional — social login) ───────────────────────────────────────────
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# ── TheirStack (optional — India tech job cache) ──────────────────────────────
THEIRSTACK_API_KEY=your-key
REFRESH_THEIRSTACK=true

# ── Credential encryption ─────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CREDENTIALS_ENCRYPTION_KEY=your-32-byte-hex-key

PORT=3001
```

### Root `.env` (Docker only — frontend build args)

```env
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_PERCENTAGE_ENABLE=true
```

---

## AI Setup

The backend selects an AI provider based on your env vars:

| Flag | Value | Behaviour |
|------|-------|-----------|
| `USE_API` | `true` | Use Claude Opus 4.7 (requires `ANTHROPIC_API_KEY`) |
| `USE_API` | `false` | Use local Ollama |
| `USE_API` | unset | Auto-detect: Claude if key present, otherwise Ollama |
| `USE_API_FOR_AUTO_APPLY` | `true` / `false` | Same logic, but only for the auto-apply agent |

### Ollama quick-start

```bash
# macOS
brew install ollama
ollama serve                # starts on http://localhost:11434

# Pull a model that supports tool calling (required for auto-apply)
ollama pull qwen2.5         # 4 GB — strong at forms
ollama pull llama3.2        # 2 GB — lighter, good for testing
```

Models that **do not** support tool calling (will error with auto-apply): `phi3`, `tinyllama`.

---

## Auto-Apply Setup

The auto-apply agent uses Playwright to control a real browser.

### 1. Install Playwright browsers (manual setup only)

```bash
cd backend
npx playwright install chromium
```

> Docker handles this automatically during `docker compose build`.

### 2. Connect a job site account

In your Profile → **Job Site Credentials**, enter your email and password for a site. Then click **Connect Account** — a browser window opens so you can log in and complete 2FA. The session is saved; future auto-apply runs skip the login entirely.

### 3. Apply for a job

Click ⚡ on any job card → select a resume → **Start Auto Apply**. The agent runs headlessly in the background and logs its progress in the modal.

### Browser visibility

| `SHOW_BROWSER` | Behaviour |
|----------------|-----------|
| `false` (default) | Headless — no window, full background task |
| `true` | Visible browser — watch the agent work; you can solve CAPTCHAs manually |

---

## Social Login (Auth0)

1. Create a **Single Page Application** in [Auth0 Dashboard](https://manage.auth0.com)
2. Set **Application Type** → **Single Page Application**
3. **Allowed Callback URLs**: `http://localhost:5173/callback` (manual) or `http://localhost/callback` (Docker)
4. **Allowed Logout URLs**: `http://localhost:5173` / `http://localhost`
5. **Allowed Web Origins**: `http://localhost:5173` / `http://localhost`
6. Enable social connections under **Authentication → Social**
7. Copy Domain + Client ID into your `.env` files

---

## Deployment

### Docker on a VPS (recommended)

Works on any VPS with Docker installed (Hetzner, DigitalOcean, AWS EC2, etc.).

```bash
# On the server
git clone https://github.com/ziaualhassain/Jobhunt.git /srv/jobhunters
cd /srv/jobhunters

cp backend/.env.example backend/.env
# Edit backend/.env with production values

cat > .env <<'EOF'
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_PERCENTAGE_ENABLE=true
EOF

docker compose up -d --build
```

For HTTPS, put Nginx or Caddy in front on the host:

```nginx
# /etc/nginx/sites-available/jobhunters
server {
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
certbot --nginx -d yourdomain.com   # free SSL
```

Update Auth0 Allowed URLs to include your production domain.

### Frontend only → Vercel (free)

```bash
cd frontend && vercel
```

Set in Vercel dashboard → Environment Variables:

| Variable | Value |
|----------|-------|
| `VITE_AUTH0_DOMAIN` | your Auth0 domain |
| `VITE_AUTH0_CLIENT_ID` | your Auth0 client ID |
| `VITE_PERCENTAGE_ENABLE` | `true` |

Add `frontend/vercel.json` for client-side routing:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### Backend only → VPS with PM2

```bash
# Install Node.js and PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

# Install Playwright browser
cd /srv/jobhunters/backend
npx playwright install --with-deps chromium

# Start
cp .env.example .env   # fill in production values
npm install --omit=dev
pm2 start src/index.js --name jobhunters-api
pm2 save && pm2 startup
```

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
├── docker-compose.yml          Wires frontend + backend; named volume for uploads
├── .dockerignore
├── frontend/
│   ├── Dockerfile              Multi-stage: Vite build → Nginx
│   ├── nginx.conf              SPA routing + /api proxy to backend
│   └── src/
│       ├── components/         JobCard, AutoApplyModal, ApplicationCard, …
│       ├── context/            AuthContext (JWT + Auth0 session management)
│       ├── pages/              JobsPage, TrackerPage, ResumeEnhancerPage,
│       │                       InterviewCoachPage, PrepTrackerPage,
│       │                       ProfilePage, LoginPage, RegisterPage, CallbackPage
│       ├── lib/api.ts          Axios client + all typed API functions
│       └── types/              Shared TypeScript interfaces
├── backend/
│   ├── Dockerfile              Node 20 + Playwright Chromium
│   ├── certs/aiven-ca.pem      Aiven PostgreSQL CA certificate (required)
│   └── src/
│       ├── routes/             auth, jobs, applications, profile, resume,
│       │                       interview, prep, applicationProfile, autoApply
│       ├── services/           jobSources.js, resumeAnalyzer.js,
│       │                       autoApply.js, interviewCoach.js,
│       │                       theirStackSync.js, llmProvider.js
│       ├── db/                 database.js (schema init + pg pool)
│       └── middleware/         auth.js (JWT + JWKS verification for Auth0)
├── package.json                Root scripts: dev, install:all
└── README.md
```

---

## Scripts

### Manual (Node.js)

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install all dependencies (root + frontend + backend) |
| `npm run dev` | Start frontend + backend concurrently |
| `cd frontend && npm run build` | Production frontend build |
| `cd backend && npm start` | Backend only (production) |

### Docker

| Command | Description |
|---------|-------------|
| `docker compose up --build` | Build images and start all services |
| `docker compose up -d` | Start in detached (background) mode |
| `docker compose down` | Stop containers (volume preserved) |
| `docker compose down -v` | Stop containers and delete the uploads volume |
| `docker compose logs -f backend` | Stream backend logs |
| `docker compose logs -f frontend` | Stream Nginx logs |

---

*Made with ♥ by Team Insighters*
