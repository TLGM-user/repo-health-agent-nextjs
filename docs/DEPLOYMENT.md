# GitFlow Analytics — Production Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Vercel                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Next.js   │  │   API Routes │  │ Middleware │ │
│  │   (Edge)    │  │  (Node.js)   │  │   (Clerk)  │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │     Stripe      │
│   (Supabase)    │  │    (Cloud)      │
└─────────────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│  GitHub App API │
│   (Webhooks)    │
└─────────────────┘
```

---

## Option A: Vercel (Recommended)

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-org/repo-health-agent-nextjs.git
git push -u origin main
```

### Step 2: Import to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New** → **Project**
3. Select your GitHub repo
4. Framework preset: **Next.js** (auto-detected)

### Step 3: Environment Variables
Add all variables from `.env.local` in Vercel dashboard:

```
POSTGRES_URL=postgresql://...
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_TOKEN=...
QUEUE_MODE=persistent
WORKER_SCHEDULER_INTERVAL_MS=60000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID_PRO=...
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### Step 4: Deploy
Click **Deploy**. Vercel will build and deploy automatically.

### Step 5: Update Webhook URLs
After deployment, update:
- **Stripe webhook**: `https://your-domain.vercel.app/api/webhooks/stripe`
- **GitHub App webhook**: `https://your-domain.vercel.app/api/github/webhook`
- **Clerk URLs**: Already configured via env vars

---

## Option B: Docker (Self-Hosted)

### `Dockerfile`
```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate 2>/dev/null || true
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

### `docker-compose.yml`
```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - POSTGRES_URL=postgresql://gitflow:gitflow_password@db:5432/gitflow_db
      - NEXT_PUBLIC_APP_URL=http://localhost:3000
      # ... other env vars
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: gitflow
      POSTGRES_PASSWORD: gitflow_password
      POSTGRES_DB: gitflow_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

### Deploy
```bash
docker-compose up -d
```

---

## Option C: Railway / Render

### Railway
1. Go to [railway.app](https://railway.app)
2. Create new project → Deploy from GitHub repo
3. Add PostgreSQL plugin
4. Set environment variables
5. Deploy

### Render
1. Go to [render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repo
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Add PostgreSQL database
7. Set environment variables

---

## Post-Deployment Checklist

- [ ] Landing page loads correctly
- [ ] Sign in with Clerk works
- [ ] Stripe checkout completes
- [ ] GitHub App installs successfully
- [ ] Webhook events are received
- [ ] Database tables are created
- [ ] Scheduled scans run on worker
- [ ] Alerts are created for critical issues
- [ ] Export reports download correctly
- [ ] Settings save notification preferences

## Monitoring

### Vercel Analytics
- Enable in project settings
- Track page views, performance, errors

### Sentry (Error Tracking)
```bash
npm install @sentry/nextjs
```

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Uptime Monitoring
- Use [UptimeRobot](https://uptimerobot.com) or [Better Stack](https://betterstack.com)
- Monitor `https://your-domain.vercel.app/api/billing` (health endpoint)

## Scaling

### Vercel
- Auto-scales with traffic
- Serverless functions for API routes
- Edge caching for static assets

### Database
- Supabase: Upgrade plan for more connections
- Use connection pooling (PgBouncer)

### Queue
- Increase `WORKER_SCHEDULER_INTERVAL_MS` for faster processing
- Use external cron (GitHub Actions) to call `/api/workers/process`

---

## GitHub Actions CI/CD

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
```
