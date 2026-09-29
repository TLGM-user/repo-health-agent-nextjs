import { pool } from "@/lib/db";
import { PlanId } from "@/lib/stripe";

export interface BillingInfo {
  plan: PlanId;
  status: "active" | "canceled" | "past_due" | "trialing" | "none";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export async function ensureBillingTables() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_customers (
      id SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "stripeCustomerId" TEXT UNIQUE,
      "stripeSubscriptionId" TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'none',
      "currentPeriodEnd" TIMESTAMPTZ,
      "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_events (
      id SERIAL PRIMARY KEY,
      "stripeEventId" TEXT NOT NULL UNIQUE,
      "stripeCustomerId" TEXT,
      "stripeSubscriptionId" TEXT,
      type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getBillingInfo(userId: string): Promise<BillingInfo> {
  if (!pool) {
    return { plan: "free", status: "none", stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  await ensureBillingTables();

  const result = await pool.query(
    `SELECT * FROM billing_customers WHERE "userId" = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { plan: "free", status: "none", stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  const row = result.rows[0];
  return {
    plan: row.plan as PlanId,
    status: row.status,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}

export async function upsertBillingCustomer(data: {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan?: PlanId;
  status?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  if (!pool) return;

  await ensureBillingTables();

  await pool.query(
    `INSERT INTO billing_customers ("userId", "stripeCustomerId", "stripeSubscriptionId", plan, status, "currentPeriodEnd", "cancelAtPeriodEnd")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ("userId") DO UPDATE
     SET "stripeCustomerId" = COALESCE(EXCLUDED."stripeCustomerId", billing_customers."stripeCustomerId"),
         "stripeSubscriptionId" = COALESCE(EXCLUDED."stripeSubscriptionId", billing_customers."stripeSubscriptionId"),
         plan = COALESCE(EXCLUDED.plan, billing_customers.plan),
         status = COALESCE(EXCLUDED.status, billing_customers.status),
         "currentPeriodEnd" = COALESCE(EXCLUDED."currentPeriodEnd", billing_customers."currentPeriodEnd"),
         "cancelAtPeriodEnd" = COALESCE(EXCLUDED."cancelAtPeriodEnd", billing_customers."cancelAtPeriodEnd"),
         "updatedAt" = NOW()`,
    [
      data.userId,
      data.stripeCustomerId ?? null,
      data.stripeSubscriptionId ?? null,
      data.plan ?? "free",
      data.status ?? "none",
      data.currentPeriodEnd ?? null,
      data.cancelAtPeriodEnd ?? false,
    ]
  );
}

export async function recordBillingEvent(data: {
  stripeEventId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  type: string;
  payload: Record<string, unknown>;
}) {
  if (!pool) return;

  await ensureBillingTables();

  await pool.query(
    `INSERT INTO billing_events ("stripeEventId", "stripeCustomerId", "stripeSubscriptionId", type, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("stripeEventId") DO NOTHING`,
    [data.stripeEventId, data.stripeCustomerId ?? null, data.stripeSubscriptionId ?? null, data.type, JSON.stringify(data.payload)]
  );
}
