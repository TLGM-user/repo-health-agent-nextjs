import { Pool } from "pg";

const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

export async function ensureContactTable() {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
