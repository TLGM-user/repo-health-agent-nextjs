# GitFlow Analytics — Testing Strategy

## Test Architecture

We use **Vitest** for unit tests and **Playwright** for E2E tests.

```
tests/
├── unit/
│   ├── lib/
│   │   ├── stripe.test.ts
│   │   ├── billing.test.ts
│   │   ├── retention.test.ts
│   │   └── repo-health.test.ts
│   └── components/
│       ├── FeatureCard.test.tsx
│       └── Navbar.test.tsx
├── integration/
│   ├── api/
│   │   ├── checkout.test.ts
│   │   ├── webhooks.test.ts
│   │   ├── billing.test.ts
│   │   └── teams.test.ts
│   └── flows/
│       ├── onboarding.test.ts
│       └── dashboard.test.ts
└── e2e/
    ├── landing.spec.ts
    ├── pricing.spec.ts
    ├── onboarding.spec.ts
    └── dashboard.spec.ts
```

---

## Unit Tests

### `tests/unit/lib/stripe.test.ts`
```typescript
import { describe, it, expect } from "vitest";
import { PLANS, getPlanLimits } from "@/lib/stripe";

describe("PLANS", () => {
  it("has 3 plans", () => {
    expect(Object.keys(PLANS)).toEqual(["free", "pro", "enterprise"]);
  });

  it("free plan has 0 price", () => {
    expect(PLANS.free.price).toBe(0);
  });

  it("pro plan has $29 price", () => {
    expect(PLANS.pro.price).toBe(29);
  });

  it("enterprise has custom pricing", () => {
    expect(PLANS.enterprise.price).toBeNull();
  });
});

describe("getPlanLimits", () => {
  it("free plan allows 1 repo", () => {
    const limits = getPlanLimits("free");
    expect(limits.maxRepos).toBe(1);
    expect(limits.scheduledScans).toBe(false);
  });

  it("pro plan allows unlimited repos", () => {
    const limits = getPlanLimits("pro");
    expect(limits.maxRepos).toBe(Infinity);
    expect(limits.scheduledScans).toBe(true);
  });

  it("enterprise plan allows unlimited repos", () => {
    const limits = getPlanLimits("enterprise");
    expect(limits.maxRepos).toBe(Infinity);
    expect(limits.maxHistoryDays).toBe(365);
  });
});
```

### `tests/unit/lib/billing.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPlanLimits } from "@/lib/stripe";

// Mock the pool
vi.mock("@/lib/db", () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { getBillingInfo, upsertBillingCustomer } from "@/lib/billing";

describe("getBillingInfo", () => {
  it("returns free plan for new user", async () => {
    const { pool } = await import("@/lib/db");
    vi.mocked(pool!.query).mockResolvedValueOnce({ rows: [] });

    const info = await getBillingInfo("user_123");
    expect(info.plan).toBe("free");
    expect(info.status).toBe("none");
  });

  it("returns pro plan for subscribed user", async () => {
    const { pool } = await import("@/lib/db");
    vi.mocked(pool!.query).mockResolvedValueOnce({
      rows: [{
        plan: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        currentPeriodEnd: "2026-10-26",
        cancelAtPeriodEnd: false,
      }],
    });

    const info = await getBillingInfo("user_123");
    expect(info.plan).toBe("pro");
    expect(info.status).toBe("active");
  });
});
```

### `tests/unit/lib/retention.test.ts`
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  pool: {
    query: vi.fn(),
  },
}));

import {
  createTeam,
  listTeams,
  createScheduledScan,
  listAlerts,
} from "@/lib/retention";

describe("createTeam", () => {
  it("creates a team with installation", async () => {
    const { pool } = await import("@/lib/db");
    vi.mocked(pool!.query).mockResolvedValueOnce({
      rows: [{ id: 1, userId: "user_123", name: "Engineering" }],
    });

    const team = await createTeam("user_123", "Engineering", 456);
    expect(team).toMatchObject({ id: 1, name: "Engineering" });
  });
});

describe("createScheduledScan", () => {
  it("creates a scheduled scan", async () => {
    const { pool } = await import("@/lib/db");
    vi.mocked(pool!.query).mockResolvedValueOnce({
      rows: [{ id: 1, installationId: 456, repo: "owner/repo", cron: "0 9 * * 1" }],
    });

    const scan = await createScheduledScan(456, "owner/repo", "0 9 * * 1");
    expect(scan).toMatchObject({ repo: "owner/repo", cron: "0 9 * * 1" });
  });
});
```

---

## Integration Tests

### `tests/integration/api/checkout.test.ts`
```typescript
import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/checkout/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "user_123" }),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: {
      create: vi.fn().mockResolvedValue({ id: "cus_123" }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/xxx" }),
      },
    },
  },
  PLANS: {
    pro: { priceId: "price_123" },
  },
}));

describe("POST /api/checkout", () => {
  it("returns checkout URL for pro plan", async () => {
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "pro" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toContain("checkout.stripe.com");
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(await import("@clerk/nextjs/server")).auth.mockReturnValueOnce({ userId: null });

    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "pro" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

---

## E2E Tests

### `tests/e2e/landing.spec.ts`
```typescript
import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("displays hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("GitHub repo health monitoring");
  });

  test("shows pricing CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Start free" })).toBeVisible();
  });

  test("features section has 4 cards", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator("#features > div > div");
    await expect(cards).toHaveCount(4);
  });
});
```

### `tests/e2e/onboarding.spec.ts`
```typescript
import { test, expect } from "@playwright/test";

test.describe("Onboarding Flow", () => {
  test("shows 3-step progress", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByText("Connect GitHub")).toBeVisible();
    await expect(page.getByText("Select repos")).toBeVisible();
    await expect(page.getByText("Initial scan")).toBeVisible();
  });
});
```

---

## Running Tests

```bash
# Unit tests
npx vitest run tests/unit

# Integration tests
npx vitest run tests/integration

# E2E tests
npx playwright test

# All tests
npm test

# With coverage
npx vitest run --coverage
```

## CI/CD Integration

Add to `.github/workflows/test.yml`:
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npx playwright install
      - run: npx playwright test
```
