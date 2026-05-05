# JobHunt – Tech Job Search & Application Tracker

A full-stack personal job search dashboard that aggregates tech jobs from multiple sources, tracks your application pipeline, and syncs your preferences across devices.

## Features

### Job Search
- Aggregates jobs from **5 sources**: RemoteOK, We Work Remotely, Himalayas, ArbeitNow, and TheirStack
- **Smart filters** – keywords, location, tags (Roles / Languages / Frameworks / Cloud & Infra), job type, experience level, remote toggle
- **Location-aware** – searching "Hyderabad" with remote OFF shows only city-specific jobs; remote ON includes remote jobs too
- **Persistent filters** – last search is saved to your profile in the database and restored on any device after login
- **Clear button** – session-only reset that doesn't overwrite your saved preferences
- **Resume upload** – upload a PDF/DOCX résumé to get AI-powered keyword extraction and auto-populate the search (Claude Opus 4.7 or local Ollama fallback)
- Sort results by title, company, or source

### Application Tracker
- **Kanban board** with 7 columns: Saved → Applied → Phone Screen → Technical → Final Interview → Offer → Rejected
- **Drag and drop** cards between columns to update status
- **Add Job manually** – "Add Job" button opens a form to track jobs from any source (not just aggregated ones)
- **Notes** on each card, editable inline
- **Stats row** – count of applications per status
- **Direct links** back to original job postings

### User Accounts
- JWT-based auth (register / login / logout)
- **Profile page** – set your interests, preferred languages/frameworks/cloud tools, experience level, job type, location, and remote preference
- Profile preferences are used as default search filters
- Preferences stored in PostgreSQL and synced across devices

### TheirStack India Jobs
- Background sync fetches up to 300 India tech jobs on startup and refreshes every 6 hours
- Jobs are cached in PostgreSQL and served alongside live results
- Filtered by your search terms, location, and experience level

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, React Router |
| Backend | Node.js, Express |
| Database | PostgreSQL (Aiven cloud) |
| Auth | JWT (7-day expiry), bcryptjs |
| AI | Claude Opus 4.7 (adaptive thinking) · Ollama (local fallback) |
| Job Sources | RemoteOK API, We Work Remotely RSS, Himalayas API, ArbeitNow API, TheirStack API |

## Getting Started

### 1. Prerequisites

- Node.js 18+
- An [Aiven PostgreSQL](https://aiven.io) instance (free tier works)
- Download your Aiven CA certificate and save it to `backend/certs/aiven-ca.pem`

### 2. Environment

Copy the example and fill in your values:

```bash
cp backend/.env.example backend/.env
```

```env
# PostgreSQL (Aiven)
DB_HOST=your-pg-host.aivencloud.com
DB_PORT=25881
DB_USER=avnadmin
DB_PASSWORD=your-password
DB_NAME=defaultdb

# Auth
JWT_SECRET=generate-a-long-random-string

# AI resume analysis (pick one or both)
ANTHROPIC_API_KEY=sk-ant-...      # Claude Opus 4.7
OLLAMA_MODEL=llama3.2             # local fallback
OLLAMA_URL=http://localhost:11434

# TheirStack (optional – India job cache)
THEIRSTACK_API_KEY=your-key

PORT=3001
```

### 3. Install & run

```bash
# Install all dependencies (root + frontend + backend)
npm run install:all

# Start frontend + backend concurrently
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

The database schema is created automatically on first start.

## Job Sources

| Source | Type | Key Required | Notes |
|--------|------|-------------|-------|
| RemoteOK | REST API | No | Worldwide remote |
| We Work Remotely | RSS (5 feeds) | No | Worldwide remote |
| Himalayas | REST API | No | Worldwide remote |
| ArbeitNow | REST API | No | Worldwide, remote-filtered |
| TheirStack | REST API | Yes | India jobs, DB-cached |

## Resume Analysis

Upload a PDF or DOCX résumé on the Jobs page. The backend extracts skills, job titles, experience level, and search keywords using:

1. **Claude Opus 4.7** (if `ANTHROPIC_API_KEY` is set) – uses adaptive thinking and prompt caching
2. **Ollama** (if running locally) – free, no account needed; install via `brew install ollama` then `ollama pull llama3.2`

Extracted keywords auto-populate the search form.

## Project Structure

```
Jobhunt/
├── frontend/          # React + Vite app
│   └── src/
│       ├── components/   # JobCard, ApplicationCard, SearchForm, AddJobModal, …
│       ├── pages/        # JobsPage, TrackerPage, ProfilePage, LoginPage, …
│       ├── lib/api.ts    # Axios client + all API functions
│       └── types/        # Shared TypeScript types & STATUS_CONFIG
├── backend/
│   └── src/
│       ├── routes/       # auth, jobs, applications, profile, resume
│       ├── services/     # jobSources.js, resumeAnalyzer.js, theirStackSync.js
│       ├── db/           # database.js (schema init + pg pool)
│       └── middleware/   # auth.js (JWT verification)
└── package.json       # root scripts: dev, install:all
```
