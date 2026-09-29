# GitFlow Analytics — Complete Configuration Guide

## 1. Clerk Authentication

### Step 1: Create Clerk Account
1. Go to [clerk.com](https://clerk.com) and sign up
2. Create a new application named "GitFlow Analytics"
3. Choose "Email" and "GitHub" as sign-in methods

### Step 2: Get Your Keys
1. In Clerk dashboard, go to **API Keys**
2. Copy the **Publishable Key** (starts with `pk_test_`)
3. Copy the **Secret Key** (starts with `sk_test_`)

### Step 3: Configure GitHub OAuth in Clerk
1. In Clerk dashboard, go to **User & Authentication** → **Social Connections**
2. Enable **GitHub**
3. Add your GitHub OAuth App credentials (see GitHub App section below)

### Step 4: Add to `.env.local`
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
CLERK_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

---

## 2. Stripe Configuration

### Step 1: Create Stripe Account
1. Go to [stripe.com](https://stripe.com) and sign up
2. Activate test mode (toggle in top-left)

### Step 2: Get Your Keys
1. Go to **Developers** → **API Keys**
2. Copy **Secret Key** (starts with `sk_test_`)
3. Copy **Publishable Key** (starts with `pk_test_`)

### Step 3: Create Pro Plan Product
1. Go to **Products** → **Add Product**
2. Name: "GitFlow Pro"
3. Price: $29.00/month (recurring)
4. Copy the **Price ID** (starts with `price_`)

### Step 4: Configure Webhook
1. Go to **Developers** → **Webhooks**
2. Add endpoint: `http://localhost:3000/api/webhooks/stripe` (for dev)
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing Secret** (starts with `whsec_`)

### Step 5: Add to `.env.local`
```bash
STRIPE_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
STRIPE_PRICE_ID_PRO=price_your_price_id
```

---

## 3. GitHub App Setup

### Step 1: Create GitHub App
1. Go to **GitHub** → **Settings** → **Developer Settings** → **GitHub Apps**
2. Click **New GitHub App**
3. Fill in:
   - **Name**: `GitFlow Analytics`
   - **Description**: `Repo health monitoring for dev teams`
   - **Homepage URL**: `http://localhost:3000`
   - **Webhook URL**: `http://localhost:3000/api/github/webhook`
   - **Webhook Secret**: Generate a strong random string

### Step 2: Set Permissions
- **Repository permissions**:
  - Contents: **Read-only**
  - Metadata: **Read-only**
  - Pull requests: **Read and write**
  - Commit statuses: **Read and write**
  - Webhooks: **Read and write**
  - Checks: **Read and write**
- **Organization permissions**:
  - Members: **Read-only**
- **Subscribe to events**:
  - Push
  - Pull request
  - Check suite
  - Workflow run
  - Installation

### Step 3: Generate Private Key
1. Scroll down to **Private Keys**
2. Click **Generate a private key**
3. Download the `.pem` file

### Step 4: Get App ID and Client ID
1. At the top of the App page, note the **App ID**
2. Under **General** → **About**, note the **Client ID**

### Step 5: Add to `.env.local`
```bash
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### Step 6: Install the App
1. Go to **App settings** → **Install App**
2. Choose your org/account
3. Select repositories (start with one for testing)

---

## 4. PostgreSQL Database

### Option A: Local (Development)
```bash
# Using Docker
docker run -d --name gitflow-postgres \
  -e POSTGRES_USER=gitflow \
  -e POSTGRES_PASSWORD=gitflow_password \
  -e POSTGRES_DB=gitflow_db \
  -p 5432:5432 \
  postgres:16
```

```bash
POSTGRES_URL=postgresql://gitflow:gitflow_password@localhost:5432/gitflow_db
```

### Option B: Supabase (Production)
1. Go to [supabase.com](https://supabase.com) and create a project
2. Go to **Settings** → **Database**
3. Copy the **Connection string** (Session pooler)

```bash
POSTGRES_URL=postgresql://postgres:[password]@aws-0-region.pooler.supabase.com:6543/postgres
```

---

## 5. Complete `.env.local` Template

```bash
# Database
POSTGRES_URL=postgresql://username:password@host:5432/database

# GitHub App
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_TOKEN=ghp_your_personal_access_token

# Queue
QUEUE_MODE=persistent
WORKER_SCHEDULER_INTERVAL_MS=60000

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
CLERK_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
STRIPE_PRICE_ID_PRO=price_your_price_id

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 6. Verification Checklist

Run `npm run dev` and verify:

- [ ] Landing page loads at `http://localhost:3000`
- [ ] Sign in with Clerk works
- [ ] Pricing page shows 3 tiers
- [ ] Checkout flow creates Stripe session
- [ ] GitHub App installation flow works
- [ ] Onboarding completes and scan starts
- [ ] Dashboard shows repos with health scores
- [ ] Webhook events are received (check `/api/tasks`)
- [ ] Settings page saves notification preferences
- [ ] Export downloads JSON report
