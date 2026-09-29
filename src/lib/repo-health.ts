import {
  fetchFileText,
  fetchGitTree,
  fetchRepositoryMetadata,
  normalizeGitHubRepoName,
  type GitHubPullRequestSummary,
  type GitHubRepositoryMetadata,
  type GitHubTree,
} from "@/lib/github-app";
import { runDependenciesAnalyzer } from "@/lib/analyzers/dependencies";
import { runMaintenanceAnalyzer } from "@/lib/analyzers/maintenance";
import { runSecurityAnalyzer } from "@/lib/analyzers/security";
import { runTestsAnalyzer } from "@/lib/analyzers/tests";
import type { AnalyzerId, AnalyzerResult } from "@/lib/analyzers/types";
import { findDeadCodeCandidates, toDeadCodeAnalyzerResult } from "@/lib/scanners/deadcode";
import { scanTextForSecrets, toSecretsAnalyzerResult, type SecretHit } from "@/lib/scanners/secrets";

export type ScanMode = "scheduled" | "on-demand" | "cli";

export type HealthFinding = {
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  description: string;
};

export type RepoHealthResult = {
  repo: string;
  mode: ScanMode;
  score: number;
  status: "healthy" | "watch" | "critical";
  summary: string;
  checks: Array<{
    label: string;
    value: string;
    trend: string;
  }>;
  findings: HealthFinding[];
  actions: string[];
};

export type RepoAnalysisOptions = {
  repo: string;
  mode: ScanMode;
  token?: string;
  /**
   * Repository metadata: pass `undefined` to fetch it (throws on failure),
   * or `null` to explicitly run without it.
   */
  metadata?: GitHubRepositoryMetadata | null;
  pulls?: GitHubPullRequestSummary[];
};

export type RepoAnalysisOutcome = {
  result: RepoHealthResult;
  results: AnalyzerResult[];
};

const ANALYZER_WEIGHTS: Record<AnalyzerId, number> = {
  security: 0.3,
  dependencies: 0.2,
  tests: 0.2,
  maintenance: 0.1,
  deadcode: 0.1,
  secrets: 0.1,
};

const SEVERITY_ORDER: Record<HealthFinding["severity"], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function buildSummary(results: AnalyzerResult[]): string {
  const passing = results.filter((result) => result.status === "pass");
  const failing = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");
  const unknown = results.filter((result) => result.status === "unknown");

  const parts = [`${passing.length} of ${results.length} checks passing.`];

  if (failing.length > 0) {
    const details = failing
      .map((result) => `${result.label}: ${result.findings[0]?.description ?? result.detail}`)
      .join(" ");
    parts.push(details);
  }

  if (warnings.length > 0) {
    parts.push(`Watch ${warnings.map((result) => result.label).join(", ")}.`);
  }

  if (unknown.length > 0) {
    parts.push(`${unknown.map((result) => result.label).join(", ")} could not be evaluated.`);
  }

  return parts.join(" ");
}

function buildActions(results: AnalyzerResult[]): string[] {
  const priority = ["fail", "warn", "unknown", "pass"] as const;
  const actions: string[] = [];

  for (const status of priority) {
    for (const result of results) {
      if (result.status !== status) continue;
      for (const action of result.actions) {
        if (!actions.includes(action)) actions.push(action);
      }
    }
  }

  if (actions.length === 0) {
    actions.push("All checks passing — the next scan will track regressions.");
  }

  return actions.slice(0, 4);
}

/**
 * Runs the real analyzer suite against a repository.
 *
 * Each analyzer degrades independently (permission, disabled feature, missing
 * manifest) and returns `score: null` when it cannot produce a meaningful
 * signal; null scores are excluded from the weighted total instead of being
 * counted as zero.
 */
export async function runRepoHealthAnalysis(
  options: RepoAnalysisOptions
): Promise<RepoAnalysisOutcome> {
  const normalizedRepo = normalizeGitHubRepoName(options.repo);
  const { token } = options;

  let metadata = options.metadata;
  if (metadata === undefined) {
    // Throws for missing/inaccessible repositories — callers map this to HTTP errors.
    metadata = await fetchRepositoryMetadata(normalizedRepo, token);
  }

  let tree: GitHubTree | null = null;
  const ref = metadata?.default_branch ?? "HEAD";

  if (metadata) {
    const treeResult = await fetchGitTree(normalizedRepo, ref, token);
    if (treeResult.ok && treeResult.data) {
      tree = treeResult.data;
    }
  }

  const [security, dependencies, tests, maintenance] = await Promise.all([
    runSecurityAnalyzer(normalizedRepo, ref, token),
    runDependenciesAnalyzer({ repo: normalizedRepo, ref, tree, token }),
    Promise.resolve(runTestsAnalyzer(tree)),
    Promise.resolve(
      runMaintenanceAnalyzer({ metadata: metadata ?? null, tree, pulls: options.pulls ?? [] })
    ),
  ]);

  // Janitor scanners share one capped, cached file reader so dead-code and
  // secret scans together stay inside GitHub rate limits (<= ~30 content
  // fetches per scan; per-file failures degrade silently).
  const fileCache = new Map<string, string | null>();
  let contentFetches = 0;
  const MAX_CONTENT_FETCHES = 30;
  const readFileCached = async (path: string, maxBytes = 64_000): Promise<string | null> => {
    if (fileCache.has(path)) return fileCache.get(path) ?? null;
    if (contentFetches >= MAX_CONTENT_FETCHES) return null;
    contentFetches += 1;
    try {
      const text = await fetchFileText(normalizedRepo, path, ref, token);
      const capped = text ? text.slice(0, maxBytes) : null;
      fileCache.set(path, capped);
      return capped;
    } catch {
      fileCache.set(path, null);
      return null;
    }
  };

  const [deadcode, secrets] = await Promise.all([
    (async () => {
      try {
        const candidates = await findDeadCodeCandidates(tree, readFileCached);
        return toDeadCodeAnalyzerResult(candidates, fileCache.size);
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        if (!tree) return null;
        const suspicious = tree.tree
          .filter(
            (e) =>
              e.type === "blob" &&
              /(^|\/)(\.env(\.|$)|[^/]*\.(pem|key|p12|pfx)$|credentials|secrets?)/i.test(e.path) &&
              (e.size ?? 0) < 200_000
          )
          .slice(0, 8);
        const hits: SecretHit[] = [];
        await Promise.all(
          suspicious.map(async (e) => {
            const text = await readFileCached(e.path, 32_000);
            if (text) hits.push(...scanTextForSecrets(e.path, text));
          })
        );
        return toSecretsAnalyzerResult(hits, suspicious.length);
      } catch {
        return null;
      }
    })(),
  ]);

  const results: AnalyzerResult[] = [
    security,
    dependencies,
    tests,
    maintenance,
    ...(deadcode ? [deadcode] : []),
    ...(secrets ? [secrets] : []),
  ];

  let weightTotal = 0;
  let weightedScore = 0;
  for (const result of results) {
    if (result.score === null) continue;
    const weight = ANALYZER_WEIGHTS[result.id];
    weightedScore += result.score * weight;
    weightTotal += weight;
  }

  const score = weightTotal > 0 ? Math.round(weightedScore / weightTotal) : 50;
  const status: RepoHealthResult["status"] = score >= 85 ? "healthy" : score >= 70 ? "watch" : "critical";

  const findings: HealthFinding[] = results
    .flatMap((result) => result.findings)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 6);

  return {
    result: {
      repo: metadata?.full_name || normalizedRepo,
      mode: options.mode,
      score,
      status,
      summary: buildSummary(results),
      checks: results.map((result) => ({
        label: result.label,
        value: result.value,
        trend: result.trend,
      })),
      findings,
      actions: buildActions(results),
    },
    results,
  };
}

/** Per-analyzer detail persisted alongside the result for debugging/audit. */
export function analyzerMetadata(results: AnalyzerResult[]): Record<string, unknown> {
  return Object.fromEntries(results.map((result) => [result.id, result.metadata]));
}
