import { analyzeRepo, type RepoHealthResult, type ScanMode } from "@/lib/repo-health";
import type { QueueTask } from "@/lib/queue";
import {
  fetchOpenPullRequests,
  fetchRepositoryMetadata,
  normalizeGitHubRepoName,
} from "@/lib/github-app";
import { getInstallationTokenOrRefresh } from "@/lib/github-auth";
import { saveAnalysisResult, savePullRequest } from "@/lib/persistence";

function enrichReportWithMetadata(
  repo: string,
  mode: ScanMode,
  metadata: Awaited<ReturnType<typeof fetchRepositoryMetadata>> | null,
  pulls: Awaited<ReturnType<typeof fetchOpenPullRequests>>
): RepoHealthResult {
  const base = analyzeRepo(repo, mode);

  if (!metadata) {
    return base;
  }

  const scoreDelta = Math.max(-12, Math.min(12, (metadata.stargazers_count ?? 0) / 200 - (metadata.open_issues_count ?? 0) / 5));
  const adjustedScore = Math.max(40, Math.min(98, Math.round(base.score + scoreDelta)));
  const status = adjustedScore >= 85 ? "healthy" : adjustedScore >= 70 ? "watch" : "critical";
  const openPrCount = pulls.length;

  return {
    ...base,
    repo: metadata.full_name || repo,
    score: adjustedScore,
    status,
    summary:
      status === "healthy"
        ? `${metadata.full_name} is in strong shape with ${openPrCount} active PR${openPrCount === 1 ? "" : "s"}. Keep the current review cadence and watch the dependency drift.`
        : status === "watch"
          ? `${metadata.full_name} is stable but needs attention. ${metadata.open_issues_count} open issues and ${openPrCount} active PRs suggest a moderate review load.`
          : `${metadata.full_name} needs immediate attention. The repository shows sustained maintenance risk relative to issue load and change cadence.`,
    checks: [
      {
        label: "Repository activity",
        value: metadata.pushed_at ? new Date(metadata.pushed_at).toLocaleDateString() : "Unknown",
        trend: metadata.default_branch ? `Default branch: ${metadata.default_branch}` : "Recent push detected",
      },
      ...base.checks.slice(0, 3),
    ],
    findings: [
      {
        title: "GitHub health signal",
        severity: metadata.open_issues_count > 10 ? "High" : metadata.open_issues_count > 4 ? "Medium" : "Low",
        description: `${metadata.full_name} has ${metadata.open_issues_count} open issues and ${openPrCount} active PRs. Review backlog risk is ${metadata.open_issues_count > 10 ? "high" : "moderate"}.`,
      },
      ...base.findings.slice(0, 2),
    ],
    actions: [
      `Review the top ${Math.min(3, openPrCount || 1)} PR${openPrCount === 1 ? "" : "s"} and merge the low-risk changes first.`,
      "Tighten dependency upgrades on the default branch before the next release window.",
      "Add or expand test coverage around the highest-risk service modules.",
    ],
  };
}

export async function processTask(task: QueueTask) {
  const repoName = normalizeGitHubRepoName(task.repo);
  const mode = task.mode === "github-webhook" ? "on-demand" : task.mode;

  let metadata: Awaited<ReturnType<typeof fetchRepositoryMetadata>> | null = null;
  let pulls: Awaited<ReturnType<typeof fetchOpenPullRequests>> = [];

  const installationId = task.payload.installationId;

  if (typeof installationId === "number" && Number.isFinite(installationId)) {
    const accessToken = await getInstallationTokenOrRefresh(installationId);
    metadata = await fetchRepositoryMetadata(repoName, accessToken.token);
    pulls = await fetchOpenPullRequests(repoName, accessToken.token);
  } else if (process.env.GITHUB_TOKEN) {
    metadata = await fetchRepositoryMetadata(repoName, process.env.GITHUB_TOKEN);
    pulls = await fetchOpenPullRequests(repoName, process.env.GITHUB_TOKEN);
  }

  const healthReport = enrichReportWithMetadata(repoName, mode as ScanMode, metadata, pulls);
  const resultId = crypto.randomUUID();

  await saveAnalysisResult({
    id: resultId,
    repo: repoName,
    mode: mode,
    status: healthReport.status,
    score: healthReport.score,
    summary: healthReport.summary,
    checks: healthReport.checks,
    findings: healthReport.findings,
    actions: healthReport.actions,
    metadata: {
      installationId: installationId ?? null,
      repository: metadata ? metadata.full_name : repoName,
      pullRequestCount: pulls.length,
      issues: metadata?.open_issues_count ?? 0,
      updatedAt: metadata?.updated_at ?? null,
    },
  });

  for (const pull of pulls.slice(0, 10)) {
    await savePullRequest({
      id: crypto.randomUUID(),
      repo: repoName,
      number: pull.number,
      title: pull.title,
      state: pull.state,
      url: pull.url,
      payload: {
        user: pull.user?.login ?? null,
        createdAt: pull.created_at,
      },
    });
  }

  return {
    taskId: task.id,
    repo: repoName,
    status: "completed",
    result: healthReport,
    processedAt: new Date().toISOString(),
    analysisId: resultId,
    pullRequests: pulls.length,
  };
}
