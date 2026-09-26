![CI](https://github.com/TLGM-user/repo-health-agent-nextjs/actions/workflows/ci.yml/badge.svg)

# Repo Health Agent — Web Dashboard

A Next.js dashboard and API backend for the **Repo Health Agent**: connect a GitHub App to your repositories, queue health scans, and surface security, dependency, coverage, and maintenance findings — with refresh-aware GitHub installation-token handling built in.

## Features

- **GitHub App integration** — installation registration, webhook receiver (HMAC-verified), repository sync, and on-demand repository metadata / open-PR lookups.
- **Repository health analysis** — four real analyzers backed by live data: Dependabot/code-scanning/secret-scanning alerts, git file-tree inspection, npm/PyPI registry freshness checks, and activity/maintenance signals — combined into a weighted score with findings and actions, stored for trend history.
- **Persistent task queue** — scans are enqueued in Postgres (`queue_tasks`) and processed by a worker; supports webhook-triggered, scheduled, on-demand, and admin-triggered scans.
- **Built-in queue scheduler** — an optional in-process drain (`src/instrumentation.ts`) processes queued scans on an interval; external cron/CI can still trigger `POST /api/workers/process`.
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
        ┌────────────────────┐      ┌─────────────────────────┐
        │  /api/workers/     │◄─────│ scheduler (optional):   │
        │  process           │      │ src/instrumentation.ts  │
        └─────────┬──────────┘      │ interval queue drain    │
                  │                 └─────────────────────────┘
                  ▼
        ┌────────────────────┐      ┌─────────────────────────┐
        │  worker.ts         │─────►│ analyzers/              │
        │  (awaited; failure │      │ security · dependencies │
        │  captured on task) │      │ tests · maintenance     │
        └────────────────────┘      └─────────────────────────┘
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| UI | `src/app/page.tsx`, `src/components/` | Dashboard: installations, scan form, results |
| API | `src/app/api/**/route.ts` | REST endpoints (see [API reference](#api-reference)) |
| GitHub integration | `src/lib/github-app.ts` | App JWT, token exchange, webhook signature, GitHub REST fetches |
| Token auth | `src/lib/github-auth.ts` | Cached/refreshed installation tokens, invalidation |
| Persistence | `src/lib/persistence.ts`, `src/lib/db.ts` | Schema bootstrap (`pg` pool) and CRUD |
| Queue & worker | `src/lib/queue.ts`, `src/lib/worker.ts` | Task lifecycle, awaited execution with failure capture |
| Scheduler | `src/instrumentation.ts` | Optional in-process queue drain (env-gated) |
| Analysis | `src/lib/repo-health.ts` | Orchestrator: parallel analyzers, weighted scoring |
| Analyzers | `src/lib/analyzers/*.ts` | Security, dependencies, tests, maintenance (live GitHub/registry data) |

### Data flow

1. **Trigger** — dashboard form (`POST /api/repo-health`), admin action (`POST /api/admin/installations/:id/analyze`), direct enqueue (`POST /api/tasks`), or GitHub webhook (`POST /api/github/webhook`) registers the installation, syncs repos, and queues a task.
2. **Process** — the built-in scheduler (when `WORKER_SCHEDULER_INTERVAL_MS` is set) or any external caller of `POST /api/workers/process` picks the next `queued` task; the worker always awaits completion and records failures on the task.
3. **Analyze** — the worker resolves a valid installation token (cache → refresh), fetches repository metadata and open PRs, then runs the analyzer suite against live GitHub data (file tree, security alerts, npm/PyPI registries).
4. **Persist** — findings, actions, per-analyzer detail, and PR snapshots are written to Postgres for the dashboard.

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
| `WORKER_SCHEDULER_INTERVAL_MS` | Optional | Enables the built-in queue scheduler: milliseconds between drain ticks (`0` or unset = off, external schedulers use `POST /api/workers/process`). |

### 3. Run

```bash
npm run dev        # http://localhost:3000
npm run lint       # eslint
npm run build      # production build (includes type checking)
```

### GitHub App setup

1. Create a GitHub App with repository permissions: **Contents: Read** (git tree + manifest files), **Pull requests: Read**, and **Security events: Read** (Dependabot / code scanning / secret scanning alerts — without it the Security check reports `unknown` rather than failing the scan).
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
| `GET /api/repo-health` | Always `405` — analysis runs via `POST`. |
| `POST /api/repo-health` | Real on-demand analysis — `{ repo, mode?, installationId? }`; runs the analyzer suite and stores the result (`404` if the repository is missing, `403` if inaccessible). |
| `GET /api/tasks` · `POST /api/tasks` | List queued tasks / enqueue one (`repo` required). |
| `POST /api/workers/process` | Process the next queued task (external scheduler entry point; the built-in scheduler drives the same worker). |

### Installation-token refresh

`getInstallationTokenOrRefresh(installationId)` in `src/lib/github-auth.ts`:

1. Return the cached token from `github_installation_tokens` if it is valid for **at least 5 more minutes**.
2. Otherwise exchange a fresh token via the GitHub App JWT, persist it, and return it.
3. Concurrent refreshes for the same installation share a single exchange (in-flight dedupe).
4. Cached tokens are deleted when the installation is `deleted`/`suspend`ed.
5. Cache read/write failures degrade gracefully to a direct exchange — the database is never a hard dependency for minting tokens.

## Health analysis

`runRepoHealthAnalysis()` in `src/lib/repo-health.ts` runs four analyzers in parallel. Each returns a 0–100 score with status, findings, and actions — or `score: null` when the signal is genuinely unavailable (missing permission, disabled feature, unsupported ecosystem):

| Analyzer | Real signals used | Weight |
|----------|-------------------|--------|
| **Security** (`analyzers/security.ts`) | Open Dependabot, code-scanning, and secret-scanning alerts read live from the GitHub API (requires the App's `security_events` permission) | 35% |
| **Dependencies** (`analyzers/dependencies.ts`) | Manifest parsed from the git tree (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`), lockfile presence, and npm/PyPI registry freshness (capped at 8 lookups per scan) | 25% |
| **Test coverage** (`analyzers/tests.ts`) | Test-file vs source-file ratio from the git tree (`*.test.*`, `tests/`, `__tests__/`, `*_test.go`, …) plus `.github/workflows` detection | 25% |
| **Maintenance** (`analyzers/maintenance.ts`) | Last-push age, archived flag, README/LICENSE presence, open-issue backlog | 15% |

- The overall score is the weighted average of the non-null scores (weights renormalize when a check degrades to `unknown`). `healthy ≥ 85`, `watch ≥ 70`, else `critical`.
- An analyzer failing degrades that one check — it never fails the scan. Only unreadable repository metadata fails the request, mapped to explicit `404`/`403`/`502` statuses.
- With no token at all, public repositories still get real results (unauthenticated API); private repositories fail loudly with the upstream GitHub status.

## Queue scheduler

`src/instrumentation.ts` exports Next.js's [`register()` hook](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), which starts an in-process queue drain **once per server instance** when `WORKER_SCHEDULER_INTERVAL_MS` is a positive number of milliseconds:

- Each tick drains every `queued` task in order (capped at 50 per tick), awaiting each to completion.
- Success marks the task `completed` with the full result payload; a thrown error marks it `failed` with the error message — failures are never lost silently.
- An in-process lock prevents overlap between ticks and manual `POST /api/workers/process` calls.
- The worker is dynamically imported behind a `NEXT_RUNTIME === "nodejs"` guard so Node-only dependencies (`pg`, `crypto`) never enter the Edge bundle.

With the variable unset (default), scans run via external cron/CI calling `POST /api/workers/process`. On serverless platforms prefer the HTTP trigger — the in-process scheduler only lives as long as its server instance.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci`, `npm run lint`, and `npm run build` on every push to `main` and on pull requests (Node 24).

## Project structure

```
src/
├── app/
│   ├── page.tsx                 # Dashboard
│   └── api/                     # Route handlers (admin, contact, github, queue, worker)
├── components/                  # Navbar, FeatureCard
├── instrumentation.ts           # Optional in-process queue scheduler (register hook)
└── lib/
    ├── github-app.ts            # App JWT, token exchange, webhook verify, REST fetches + tree/contents
    ├── github-auth.ts           # Token cache + refresh provider
    ├── persistence.ts           # Schema bootstrap + CRUD
    ├── db.ts                    # pg pool
    ├── queue.ts · worker.ts     # Task queue + awaited scan execution (processNextQueuedTask)
    ├── repo-health.ts           # Analysis orchestrator (weighted scoring)
    ├── analyzers/               # security · dependencies · tests · maintenance
    └── installations.ts         # In-memory installation store
```

## Known limitations

- Dependency freshness is registry-verified for npm and PyPI only; other ecosystems get a manifest inventory plus a lockfile check.
- Test analysis measures test-file presence and density — it does not execute suites or read real coverage numbers.
- The Security check needs the GitHub App's `security_events` permission; without it (or a token) it reports `unknown` and is excluded from the score.
- The built-in scheduler is in-process and single-instance; multi-instance or serverless deployments should use external cron against `POST /api/workers/process`.
- Git trees for very large repositories come back `truncated`, which can undercount test/manifest files.
