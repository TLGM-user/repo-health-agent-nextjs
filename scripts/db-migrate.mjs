#!/usr/bin/env node
/**
 * DB migrate — ensures all Repo Health Agent tables exist.
 *
 * Single source of truth: imports ensureRepoHealthTables() from
 * src/lib/persistence.ts, so this script can never drift from the app
 * schema (installations, queue, tokens, repos, analyses, PRs, fix_runs).
 *
 * Run via `npm run db:migrate` (adds type-stripping + @/ alias resolution).
 * Connection: POSTGRES_URL (or DATABASE_URL / POSTGRES_PRISMA_URL).
 */
import { ensureRepoHealthTables } from "../src/lib/persistence.ts";

async function main() {
  await ensureRepoHealthTables();
  console.log(
    "Database schema is up to date " +
      "(github_installations, queue_tasks, github_installation_tokens, " +
      "github_repositories, analysis_results, pull_requests, fix_runs)."
  );
}

try {
  await main();
} catch (error) {
  console.error("Database migration failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
