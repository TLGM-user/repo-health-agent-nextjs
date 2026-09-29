import { pool } from "@/lib/db";

export async function ensureRetentionTables() {
  if (!pool) return;

  // Teams and members
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      name TEXT NOT NULL,
      "installationId" BIGINT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("userId", name)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      "teamId" INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      "userId" TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("teamId", "userId")
    );
  `);

  // Scheduled scans
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_scans (
      id SERIAL PRIMARY KEY,
      "installationId" BIGINT NOT NULL,
      repo TEXT NOT NULL,
      cron TEXT NOT NULL DEFAULT '0 9 * * 1',
      enabled BOOLEAN NOT NULL DEFAULT true,
      "lastRunAt" TIMESTAMPTZ,
      "nextRunAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Alerts and notifications
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      repo TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      acknowledged BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Notification settings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "slackWebhookUrl" TEXT,
      "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
      "alertOnCritical" BOOLEAN NOT NULL DEFAULT true,
      "alertOnWatch" BOOLEAN NOT NULL DEFAULT false,
      "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// Team functions
export async function createTeam(userId: string, name: string, installationId?: number) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `INSERT INTO teams ("userId", name, "installationId") VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, installationId ?? null]
  );
  return result.rows[0];
}

export async function listTeams(userId: string) {
  if (!pool) return [];
  await ensureRetentionTables();
  const result = await pool.query(
    `SELECT * FROM teams WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId]
  );
  return result.rows;
}

export async function addTeamMember(teamId: number, userId: string, role: string) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `INSERT INTO team_members ("teamId", "userId", role) VALUES ($1, $2, $3) ON CONFLICT ("teamId", "userId") DO UPDATE SET role = EXCLUDED.role RETURNING *`,
    [teamId, userId, role]
  );
  return result.rows[0];
}

export async function listTeamMembers(teamId: number) {
  if (!pool) return [];
  await ensureRetentionTables();
  const result = await pool.query(
    `SELECT * FROM team_members WHERE "teamId" = $1`,
    [teamId]
  );
  return result.rows;
}

// Scheduled scans
export async function createScheduledScan(installationId: number, repo: string, cron: string) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `INSERT INTO scheduled_scans ("installationId", repo, cron) VALUES ($1, $2, $3) RETURNING *`,
    [installationId, repo, cron]
  );
  return result.rows[0];
}

export async function listScheduledScans(installationId?: number) {
  if (!pool) return [];
  await ensureRetentionTables();
  const result = await pool.query(
    installationId
      ? `SELECT * FROM scheduled_scans WHERE "installationId" = $1 ORDER BY "createdAt" DESC`
      : `SELECT * FROM scheduled_scans ORDER BY "createdAt" DESC`,
    installationId ? [installationId] : []
  );
  return result.rows;
}

export async function toggleScheduledScan(id: number, enabled: boolean) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `UPDATE scheduled_scans SET enabled = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
    [id, enabled]
  );
  return result.rows[0];
}

// Alerts
export async function createAlert(userId: string, repo: string, type: string, severity: string, message: string) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `INSERT INTO alerts ("userId", repo, type, severity, message) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, repo, type, severity, message]
  );
  return result.rows[0];
}

export async function listAlerts(userId: string, acknowledged?: boolean) {
  if (!pool) return [];
  await ensureRetentionTables();
  const result = await pool.query(
    acknowledged !== undefined
      ? `SELECT * FROM alerts WHERE "userId" = $1 AND acknowledged = $2 ORDER BY "createdAt" DESC`
      : `SELECT * FROM alerts WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    acknowledged !== undefined ? [userId, acknowledged] : [userId]
  );
  return result.rows;
}

export async function acknowledgeAlert(id: number) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `UPDATE alerts SET acknowledged = true WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

// Notification settings
export async function getNotificationSettings(userId: string) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `SELECT * FROM notification_settings WHERE "userId" = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function updateNotificationSettings(userId: string, settings: {
  slackWebhookUrl?: string;
  emailEnabled?: boolean;
  alertOnCritical?: boolean;
  alertOnWatch?: boolean;
  weeklyDigest?: boolean;
}) {
  if (!pool) return null;
  await ensureRetentionTables();
  const result = await pool.query(
    `INSERT INTO notification_settings ("userId", "slackWebhookUrl", "emailEnabled", "alertOnCritical", "alertOnWatch", "weeklyDigest")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("userId") DO UPDATE
     SET "slackWebhookUrl" = COALESCE(EXCLUDED."slackWebhookUrl", notification_settings."slackWebhookUrl"),
         "emailEnabled" = COALESCE(EXCLUDED."emailEnabled", notification_settings."emailEnabled"),
         "alertOnCritical" = COALESCE(EXCLUDED."alertOnCritical", notification_settings."alertOnCritical"),
         "alertOnWatch" = COALESCE(EXCLUDED."alertOnWatch", notification_settings."alertOnWatch"),
         "weeklyDigest" = COALESCE(EXCLUDED."weeklyDigest", notification_settings."weeklyDigest"),
         "updatedAt" = NOW()
     RETURNING *`,
    [
      userId,
      settings.slackWebhookUrl ?? null,
      settings.emailEnabled ?? true,
      settings.alertOnCritical ?? true,
      settings.alertOnWatch ?? false,
      settings.weeklyDigest ?? true,
    ]
  );
  return result.rows[0];
}

// Trend history
export async function getTrendHistory(repo: string, days: number = 30) {
  if (!pool) return [];
  await ensureRetentionTables();
  const result = await pool.query(
    `SELECT score, status, "createdAt"
     FROM analysis_results
     WHERE repo = $1 AND "createdAt" > NOW() - INTERVAL '${days} days'
     ORDER BY "createdAt" ASC`,
    [repo]
  );
  return result.rows;
}

// Export reports
export async function getReportData(installationId: number) {
  if (!pool) return null;
  await ensureRetentionTables();

  const installationsResult = await pool.query(
    `SELECT * FROM github_installations WHERE "installationId" = $1`,
    [installationId]
  );

  const reposResult = await pool.query(
    `SELECT * FROM github_repositories WHERE "installationId" = $1`,
    [installationId]
  );

  const analysisResult = await pool.query(
    `SELECT * FROM analysis_results
     WHERE repo IN (SELECT full_name FROM github_repositories WHERE "installationId" = $1)
     ORDER BY "createdAt" DESC`,
    [installationId]
  );

  return {
    installation: installationsResult.rows[0] ?? null,
    repositories: reposResult.rows,
    analyses: analysisResult.rows,
    generatedAt: new Date().toISOString(),
  };
}
