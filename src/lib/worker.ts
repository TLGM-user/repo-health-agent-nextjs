import type { QueueTask } from "@/lib/queue";
import {
  fetchOpenPullRequests,
  fetchRepositoryMetadata,
  normalizeGitHubRepoName,
} from "@/lib/github-app";
import { getInstallationTokenOrRefresh } from "@/lib/github-auth";
import {
  analyzerMetadata,
  runRepoHealthAnalysis,
  type RepoHealthResult,
  type ScanMode,
} from "@/lib/repo-health";
import { listTasks, saveAnalysisResult, savePullRequest, updateTaskStatus } from "@/lib/persistence";

export type ProcessedTaskResult = {
  taskId: string;
  repo: string;
  status: "completed";
  result: RepoHealthResult;
  processedAt: string;
  analysisId: string;
  pullRequests: number;
};

export async function processTask(task: QueueTask): Promise<ProcessedTaskResult> {
  const repoName = normalizeGitHubRepoName(task.repo);
  const mode: ScanMode = task.mode === "github-webhook" ? "on-demand" : task.mode;

  const installationId = task.payload.installationId;
  let token: string | undefined;

  if (typeof installationId === "number" && Number.isFinite(installationId)) {
    token = (await getInstallationTokenOrRefresh(installationId)).token;
  } else if (process.env.GITHUB_TOKEN) {
    token = process.env.GITHUB_TOKEN;
  }

  // Throws for missing/inaccessible repositories — processNextQueuedTask
  // records the failure on the task instead of losing it.
  const metadata = await fetchRepositoryMetadata(repoName, token);
  const pulls = await fetchOpenPullRequests(repoName, token);

  const { result, results } = await runRepoHealthAnalysis({
    repo: repoName,
    mode,
    token,
    metadata,
    pulls,
  });

  const resultId = crypto.randomUUID();

  await saveAnalysisResult({
    id: resultId,
    repo: repoName,
    mode: mode,
    status: result.status,
    score: result.score,
    summary: result.summary,
    checks: result.checks,
    findings: result.findings,
    actions: result.actions,
    metadata: {
      installationId: installationId ?? null,
      repository: metadata.full_name,
      pullRequestCount: pulls.length,
      issues: metadata.open_issues_count ?? 0,
      updatedAt: metadata.updated_at ?? null,
      analyzers: analyzerMetadata(results),
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
    result,
    processedAt: new Date().toISOString(),
    analysisId: resultId,
    pullRequests: pulls.length,
  };
}

export type TaskOutcome =
  | { processed: false; reason: "queue-empty" | "worker-busy" }
  | { processed: true; taskId: string; ok: true; result: ProcessedTaskResult }
  | { processed: true; taskId: string; ok: false; error: string };

let workerBusy = false;

/**
 * Processes the next queued task, always awaiting completion:
 * - success → task marked `completed` with the result payload
 * - thrown error → task marked `failed` with the error message
 * - concurrent calls → the second caller reports `worker-busy` instead of
 *   double-processing (protects the interval scheduler and HTTP trigger)
 */
export async function processNextQueuedTask(): Promise<TaskOutcome> {
  if (workerBusy) {
    return { processed: false, reason: "worker-busy" };
  }

  workerBusy = true;
  try {
    const tasks = await listTasks();
    const nextTask = tasks.find((task) => task.status === "queued");

    if (!nextTask) {
      return { processed: false, reason: "queue-empty" };
    }

    await updateTaskStatus(nextTask.id, "processing");

    try {
      const result = await processTask({
        id: nextTask.id,
        repo: nextTask.repo,
        mode: nextTask.mode,
        type: nextTask.type,
        payload: nextTask.payload,
        status: "processing",
        createdAt: nextTask.createdAt,
        updatedAt: nextTask.updatedAt,
      });

      await updateTaskStatus(nextTask.id, "completed", { result });

      return { processed: true, taskId: nextTask.id, ok: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateTaskStatus(nextTask.id, "failed", { error: message });

      return { processed: true, taskId: nextTask.id, ok: false, error: message };
    }
  } finally {
    workerBusy = false;
  }
}
