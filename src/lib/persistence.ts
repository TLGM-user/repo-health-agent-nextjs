import { pool } from "@/lib/db";

export async function ensureRepoHealthTables() {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS github_installations (
      id SERIAL PRIMARY KEY,
      "installationId" BIGINT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      repo TEXT,
      "accountType" TEXT NOT NULL DEFAULT 'Organization',
      status TEXT NOT NULL DEFAULT 'active',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS queue_tasks (
      id UUID PRIMARY KEY,
      repo TEXT NOT NULL,
      mode TEXT NOT NULL,
      type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS github_installation_tokens (
      "installationId" BIGINT PRIMARY KEY,
      token TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      "repositorySelection" TEXT NOT NULL DEFAULT 'all',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS github_repositories (
      id SERIAL PRIMARY KEY,
      "installationId" BIGINT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      private BOOLEAN NOT NULL DEFAULT false,
      default_branch TEXT,
      html_url TEXT,
      selected BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("installationId", full_name)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id UUID PRIMARY KEY,
      repo TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL,
      checks JSONB NOT NULL DEFAULT '[]'::jsonb,
      findings JSONB NOT NULL DEFAULT '[]'::jsonb,
      actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id UUID PRIMARY KEY,
      repo TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      url TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_runs (
      id UUID PRIMARY KEY,
      repo TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'on-demand',
      branch TEXT NOT NULL,
      title TEXT NOT NULL,
      files JSONB NOT NULL DEFAULT '[]'::jsonb,
      "eligibleCount" INTEGER NOT NULL DEFAULT 0,
      "deferredCount" INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'preview',
      "prNumber" INTEGER,
      "prUrl" TEXT,
      "installationId" BIGINT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function saveInstallation(record: {
  installationId: number;
  owner: string;
  repo?: string;
  accountType: "User" | "Organization";
  status: "active" | "disabled" | "pending";
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO github_installations ("installationId", owner, repo, "accountType", status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ("installationId") DO UPDATE
      SET owner = EXCLUDED.owner,
          repo = EXCLUDED.repo,
          "accountType" = EXCLUDED."accountType",
          status = EXCLUDED.status,
          "updatedAt" = NOW()
      RETURNING *
    `,
    [record.installationId, record.owner, record.repo ?? null, record.accountType, record.status]
  );

  return result.rows[0];
}

export async function listInstallations() {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(`
    SELECT *
    FROM github_installations
    ORDER BY "createdAt" DESC
  `);

  return result.rows;
}

export async function saveInstallationToken(record: {
  installationId: number;
  token: string;
  expiresAt: string;
  permissions?: Record<string, string>;
  repositorySelection?: string;
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO github_installation_tokens ("installationId", token, "expiresAt", permissions, "repositorySelection")
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ("installationId") DO UPDATE
      SET token = EXCLUDED.token,
          "expiresAt" = EXCLUDED."expiresAt",
          permissions = EXCLUDED.permissions,
          "repositorySelection" = EXCLUDED."repositorySelection",
          "updatedAt" = NOW()
      RETURNING *
    `,
    [
      record.installationId,
      record.token,
      record.expiresAt,
      JSON.stringify(record.permissions ?? {}),
      record.repositorySelection ?? "all",
    ]
  );

  return result.rows[0];
}

export async function getInstallationToken(installationId: number) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  // Only return tokens that are still valid for at least the next 5 minutes;
  // anything expiring sooner must be refreshed by the caller.
  const result = await pool.query(
    `
      SELECT *
      FROM github_installation_tokens
      WHERE "installationId" = $1
        AND "expiresAt" > NOW() + INTERVAL '5 minutes'
      LIMIT 1
    `,
    [installationId]
  );

  return result.rows[0] ?? null;
}

export async function deleteInstallationToken(installationId: number) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  await pool.query(
    `
      DELETE FROM github_installation_tokens
      WHERE "installationId" = $1
    `,
    [installationId]
  );
}

export async function saveRepositoryRegistration(record: {
  installationId: number;
  name: string;
  fullName: string;
  private?: boolean;
  defaultBranch?: string | null;
  htmlUrl?: string | null;
  selected?: boolean;
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO github_repositories ("installationId", name, full_name, private, default_branch, html_url, selected)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT ("installationId", full_name) DO UPDATE
      SET name = EXCLUDED.name,
          private = EXCLUDED.private,
          default_branch = EXCLUDED.default_branch,
          html_url = EXCLUDED.html_url,
          selected = EXCLUDED.selected,
          "updatedAt" = NOW()
      RETURNING *
    `,
    [
      record.installationId,
      record.name,
      record.fullName,
      Boolean(record.private),
      record.defaultBranch ?? null,
      record.htmlUrl ?? null,
      record.selected ?? true,
    ]
  );

  return result.rows[0];
}

export async function listRepositoriesForInstallation(installationId: number) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      SELECT *
      FROM github_repositories
      WHERE "installationId" = $1
      ORDER BY "createdAt" DESC
    `,
    [installationId]
  );

  return result.rows;
}

export async function saveTask(task: {
  id: string;
  repo: string;
  mode: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO queue_tasks (id, repo, mode, type, payload, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET repo = EXCLUDED.repo,
          mode = EXCLUDED.mode,
          type = EXCLUDED.type,
          payload = EXCLUDED.payload,
          status = EXCLUDED.status,
          "updatedAt" = NOW()
      RETURNING *
    `,
    [task.id, task.repo, task.mode, task.type, JSON.stringify(task.payload), task.status]
  );

  return result.rows[0];
}

export async function listTasks() {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(`
    SELECT *
    FROM queue_tasks
    ORDER BY "createdAt" DESC
  `);

  return result.rows;
}

export async function updateTaskStatus(id: string, status: string, payload?: Record<string, unknown>) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  const nextPayload = payload ? JSON.stringify(payload) : undefined;

  const result = await pool.query(
    `
      UPDATE queue_tasks
      SET status = $2,
          payload = COALESCE($3::jsonb, payload),
          "updatedAt" = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, status, nextPayload]
  );

  return result.rows[0] ?? null;
}

export async function saveAnalysisResult(record: {
  id: string;
  repo: string;
  mode: string;
  status: string;
  score: number;
  summary: string;
  checks: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  actions: string[];
  metadata?: Record<string, unknown>;
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO analysis_results (id, repo, mode, status, score, summary, checks, findings, actions, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE
      SET repo = EXCLUDED.repo,
          mode = EXCLUDED.mode,
          status = EXCLUDED.status,
          score = EXCLUDED.score,
          summary = EXCLUDED.summary,
          checks = EXCLUDED.checks,
          findings = EXCLUDED.findings,
          actions = EXCLUDED.actions,
          metadata = EXCLUDED.metadata,
          "updatedAt" = NOW()
      RETURNING *
    `,
    [
      record.id,
      record.repo,
      record.mode,
      record.status,
      record.score,
      record.summary,
      JSON.stringify(record.checks ?? []),
      JSON.stringify(record.findings ?? []),
      JSON.stringify(record.actions ?? []),
      JSON.stringify(record.metadata ?? {}),
    ]
  );

  return result.rows[0];
}

export async function listAnalysisResults() {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(`
    SELECT *
    FROM analysis_results
    ORDER BY "createdAt" DESC
  `);

  return result.rows;
}

export async function savePullRequest(record: {
  id: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  url: string;
  payload?: Record<string, unknown>;
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO pull_requests (id, repo, number, title, state, url, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
      SET repo = EXCLUDED.repo,
          number = EXCLUDED.number,
          title = EXCLUDED.title,
          state = EXCLUDED.state,
          url = EXCLUDED.url,
          payload = EXCLUDED.payload,
          "updatedAt" = NOW()
      RETURNING *
    `,
    [
      record.id,
      record.repo,
      record.number,
      record.title,
      record.state,
      record.url,
      JSON.stringify(record.payload ?? {}),
    ]
  );

  return result.rows[0];
}

export async function listPullRequests(repo?: string) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    repo
      ? `
          SELECT *
          FROM pull_requests
          WHERE repo = $1
          ORDER BY "createdAt" DESC
        `
      : `
          SELECT *
          FROM pull_requests
          ORDER BY "createdAt" DESC
        `,
    repo ? [repo] : []
  );

  return result.rows;
}

export type FixRunStatus = "preview" | "applied" | "failed";

/** Previews expire after 24h — approvals must be fresh, never stale. */
export const FIX_RUN_TTL_MS = 24 * 60 * 60 * 1000;

export function isFixRunExpired(createdAt: string | Date, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > FIX_RUN_TTL_MS;
}

export async function saveFixRun(record: {
  id: string;
  repo: string;
  mode: string;
  branch: string;
  title: string;
  files: string[];
  eligibleCount: number;
  deferredCount: number;
  status?: FixRunStatus;
  installationId?: number | null;
}) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    `
      INSERT INTO fix_runs (id, repo, mode, branch, title, files, "eligibleCount", "deferredCount", status, "installationId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE
      SET repo = EXCLUDED.repo,
          branch = EXCLUDED.branch,
          title = EXCLUDED.title,
          files = EXCLUDED.files,
          "eligibleCount" = EXCLUDED."eligibleCount",
          "deferredCount" = EXCLUDED."deferredCount",
          "updatedAt" = NOW()
      RETURNING *
    `,
    [
      record.id,
      record.repo,
      record.mode,
      record.branch,
      record.title,
      JSON.stringify(record.files),
      record.eligibleCount,
      record.deferredCount,
      record.status ?? "preview",
      record.installationId ?? null,
    ]
  );

  return result.rows[0];
}

export async function getFixRun(id: string) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(`SELECT * FROM fix_runs WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function updateFixRun(
  id: string,
  patch: { status: FixRunStatus; prNumber?: number | null; prUrl?: string | null; installationId?: number | null }
) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  const result = await pool.query(
    `
      UPDATE fix_runs
      SET status = $2,
          "prNumber" = COALESCE($3, "prNumber"),
          "prUrl" = COALESCE($4, "prUrl"),
          "installationId" = COALESCE($5, "installationId"),
          "updatedAt" = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, patch.status, patch.prNumber ?? null, patch.prUrl ?? null, patch.installationId ?? null]
  );

  return result.rows[0] ?? null;
}

export async function listFixRuns(repo?: string) {
  if (!pool) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
  }

  await ensureRepoHealthTables();

  const result = await pool.query(
    repo
      ? `SELECT * FROM fix_runs WHERE repo = $1 ORDER BY "createdAt" DESC`
      : `SELECT * FROM fix_runs ORDER BY "createdAt" DESC`,
    repo ? [repo] : []
  );

  return result.rows;
}
