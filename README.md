![CI](https://github.com/TLGM-user/repo-health-agent-nextjs/actions/workflows/ci.yml/badge.svg)

# Repo Health Agent — Web Dashboard

A Next.js dashboard and API backend for the **Repo Health Agent**: connect a GitHub App to your repositories, queue health scans, and surface security, dependency, coverage, and maintenance findings — with refresh-aware GitHub installation-token handling built in.

## Features

- **GitHub App integration** — installation registration, webhook receiver (HMAC-verified), repository sync, and on-demand repository metadata / open-PR lookups.
- **Repository health analysis** — score, status (`healthy` / `watch` / `critical`), checks, findings, and recommended actions per repository, stored for trend history.
- **Persistent task queue** — scans are enqueued in Postgres (`queue_tasks`) and processed by a worker endpoint; supports webhook-triggered, scheduled, on-demand, and admin-triggered scans.
- **Installation token management** — tokens are cached in Postgres, refreshed 5 minutes before expiry, deduped across concurrent requests, and invalidated on uninstall/suspend (see [`src/lib/github-auth.ts`](src/lib/github-auth.ts)).
- **Admin dashboard** — installations, registered repositories, latest analysis results, and a scan-triggering form.
- **Contact form** — persisted to Postgres.

## Architecture

```
             Browser dashboard                     GitHub
                   │                          (webhooks + REST API)
                   ▼                                  │
        ┌────────────────────┐              ┌─────────▼──────────┐
        │  Next.js App Router│◄─────────────│  /api/github/*     │
        │  (pages + route    │  HMAC verify │  webhook, token,   │
        │   handlers)        │              │  repos, install    │
        └─────────┬──────────┘              └─────────┬──────────┘
                  │ enqueue / trigger                  │ refresh-aware
                  ▼                                   ▼ tokens
        ┌────────────────────┐              ┌──────────────────────┐
        │  Postgres          │              │  github-auth.ts      │
        │  queue_tasks,      │◄────────────►│  cache → refresh →   │
        │  analysis_results, │              │  persist (deduped)   │
        │  installations,    │              └──────────────────────┘
        │  tokens, PRs       │
        └─────────┬──────────┘
                  │ next queued task
                  ▼
        ┌────────────────────┐
        │  /api/workers/     │──► worker.ts: fetch metadata + PRs,
        │  process           │    analyzeRepo(), persist results
        └────────────────────┘
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| UI | `src/app/page.tsx`, `src/components/` | Dashboard: installations, scan form, results |
| API | `src/app/api/**/route.ts` | REST endpoints (see [API reference](#api-reference)) |
| GitHub integration | `src/lib/github-app.ts` | App JWT, token exchange, webhook signature, GitHub REST fetches |
| Token auth | `src/lib/github-auth.ts` | Cached/refreshed installation tokens, invalidation |
| Persistence | `src/lib/persistence.ts`, `src/lib/db.ts` | Schema bootstrap (`pg` pool) and CRUD |
| Queue & worker | `src/lib/queue.ts`, `src/lib/worker.ts` | Task lifecycle, scan execution |
| Analysis | `src/lib/repo-health.ts` | Health scoring and findings |

### Data flow

1. **Trigger** — dashboard form (`POST /api/repo-health`), admin action (`POST /api/admin/installations/:id/analyze`), direct enqueue (`POST /api/tasks`), or GitHub webhook (`POST /api/github/webhook`) registers the installation, syncs repos, and queues a task.
2. **Process** — `POST /api/workers/process` picks the next `queued` task.
3. **Enrich** — the worker resolves a valid installation token (cache → refresh), fetches repository metadata and open PRs.
4. **Persist** — analysis result and PR snapshots are written to Postgres for the dashboard.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL (`pg`)

## Getting started

### Prerequisites

- Node.js 24 (LTS) and npm
- A PostgreSQL database (optional for UI-only exploration — DB-backed endpoints return a clear error without it)
- A GitHub App (optional — without one, scans use `GITHUB_TOKEN` fallback when configured)

### 1. Install

```bash
git clone https://github.com/TLGM-user/repo-health-agent-nextjs.git
cd repo-health-agent-nextjs
npm ci
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `POSTGRES_URL` | For DB features | Primary Postgres connection string. `DATABASE_URL` and `POSTGRES_PRISMA_URL` are accepted as fallbacks. Tables are auto-created on first use. |
| `GITHUB_APP_ID` | For GitHub App auth | GitHub App ID — used as the JWT `iss` claim. |
| `GITHUB_APP_PRIVATE_KEY` | For GitHub App auth | App private key (PEM). In `.env`, keep it on one line with literal `\n` escapes, as in `.env.example`. |
| `GITHUB_CLIENT_ID` | Optional | GitHub App OAuth client ID. |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub App OAuth client secret. |
| `GITHUB_WEBHOOK_SECRET` | For webhooks | Webhook HMAC secret; `/api/github/webhook` rejects requests without it. |
| `GITHUB_TOKEN` | Optional | Personal access token fallback used when no installation token applies. |
| `NEXT_PUBLIC_APP_URL` | Optional | Base URL used by `/api/github/repos` to call the token endpoint (defaults to `http://localhost:3000`). |
| `QUEUE_MODE` | — | Reserved in `.env.example`; not read by the current code. |

### 3. Run

```bash
npm run dev        # http://localhost:3000
npm run lint       # eslint
npm run build      # production build (includes type checking)
```

### GitHub App setup

1. Create a GitHub App (repository access: **Read & write** for contents/PRs if you plan auto-fix PRs later; metadata read is enough for scans).
2. Set the webhook URL to `https://<your-host>/api/github/webhook`, content type `application/json`, and the same secret as `GITHUB_WEBHOOK_SECRET`.
3. Subscribe to events: `ping`, `installation`, `installation_repositories`, `push`, `pull_request`, `check_suite`, `workflow_run`.
4. Fill `.env` with the App ID, private key, and client credentials, then install the App on your repos.

## API reference

| Method & path | Description |
|---------------|-------------|
| `GET /` | Dashboard UI. |
| `GET /api/admin/installations` | All installations with repositories and latest analysis. |
| `GET /api/admin/installations/:id` | Single installation detail (404 if unknown). |
| `POST /api/admin/installations/:id/analyze` | Queue a scan for every registered repo (`?repo=owner/name` to filter). Returns `202`. |
| `GET /api/contact` · `POST /api/contact` | Contact form listing / submission (Postgres). |
| `GET /api/github/install` | List registered installations. |
| `POST /api/github/install` | Register an installation (`installationId` + `owner` required). |
| `POST /api/github/install/token` | Return a valid installation token (cached or refreshed). |
| `GET /api/github/repos?repo=owner/name[&installationId=N]` | Repository metadata + open PRs; explicit `502` on token failure. |
| `POST /api/github/webhook` | GitHub webhook receiver (HMAC-verified, `202` on queue). |
| `GET /api/repo-health` | Demo scheduled scan. |
| `POST /api/repo-health` | On-demand scan — `{ repo, mode?, installationId? }`. |
| `GET /api/tasks` · `POST /api/tasks` | List queued tasks / enqueue one (`repo` required). |
| `POST /api/workers/process` | Process the next queued task. |

### Installation-token refresh

`getInstallationTokenOrRefresh(installationId)` in `src/lib/github-auth.ts`:

1. Return the cached token from `github_installation_tokens` if it is valid for **at least 5 more minutes**.
2. Otherwise exchange a fresh token via the GitHub App JWT, persist it, and return it.
3. Concurrent refreshes for the same installation share a single exchange (in-flight dedupe).
4. Cached tokens are deleted when the installation is `deleted`/`suspend`ed.
5. Cache read/write failures degrade gracefully to a direct exchange — the database is never a hard dependency for minting tokens.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci`, `npm run lint`, and `npm run build` on every push to `main` and on pull requests (Node 24).

## Project structure

```
src/
├── app/
│   ├── page.tsx                 # Dashboard
│   └── api/                     # Route handlers (admin, contact, github, queue, worker)
├── components/                  # Navbar, FeatureCard
└── lib/
    ├── github-app.ts            # App JWT, token exchange, webhook verify, REST fetches
    ├── github-auth.ts           # Token cache + refresh provider
    ├── persistence.ts           # Schema bootstrap + CRUD
    ├── db.ts                    # pg pool
    ├── queue.ts · worker.ts     # Task queue + scan execution
    ├── repo-health.ts           # Health scoring
    └── installations.ts         # In-memory installation store
```

## Known limitations

- Health scoring in `repo-health.ts` is currently heuristic/deterministic rather than backed by real analyzers (SCA, coverage, complexity) — the analysis layer is the next milestone.
- `POST /api/workers/process` is designed to be called by an external scheduler (cron/CI); there is no built-in cron yet.
