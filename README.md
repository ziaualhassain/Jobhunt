# JobHunt – DevOps & Cloud Job Aggregator

A personal job search dashboard that aggregates DevOps & Cloud jobs from multiple sources and tracks your application pipeline.

## Features

- **Job Search** – Aggregates jobs from RemoteOK, We Work Remotely, Himalayas, and ArbeitNow
- **DevOps/Cloud Filters** – Quick-select tags: AWS, Kubernetes, Terraform, Docker, GCP, SRE, and more
- **Advanced Filters** – Job type, experience level, location, remote toggle
- **Application Tracker** – Kanban board with 7 columns: Saved → Applied → Phone Screen → Technical → Final Interview → Offer → Rejected
- **Notes** – Add notes to any application
- **Stats** – Summary of applications by status

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| State | TanStack Query |

## Getting Started

```bash
# Install all dependencies
npm run install:all

# Start both frontend and backend in dev mode
npm run dev
```

- Frontend: http://localhost:5173  
- Backend API: http://localhost:3001

## Job Sources

| Source | Type | Auth Required |
|--------|------|---------------|
| RemoteOK | REST API | None |
| We Work Remotely | RSS Feed | None |
| Himalayas | REST API | None |
| ArbeitNow | REST API | None |
