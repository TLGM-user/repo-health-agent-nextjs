type SchedulerGlobal = typeof globalThis & {
  __repoHealthSchedulerStarted?: boolean;
};

/**
 * In-process queue scheduler, started once per Next.js server instance.
 *
 * Enabled by setting WORKER_SCHEDULER_INTERVAL_MS to a positive number of
 * milliseconds (e.g. 15000). When unset or 0 the scheduler stays off — external
 * schedulers (cron, GitHub Actions) can still POST /api/workers/process.
 *
 * The worker is imported dynamically behind the NEXT_RUNTIME guard so the
 * Node-only module graph (pg, crypto) is never bundled for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const rawInterval = process.env.WORKER_SCHEDULER_INTERVAL_MS;
  const intervalMs = rawInterval ? Number(rawInterval) : 0;

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  const globalState = globalThis as SchedulerGlobal;
  if (globalState.__repoHealthSchedulerStarted) {
    return;
  }
  globalState.__repoHealthSchedulerStarted = true;

  const { processNextQueuedTask } = await import("@/lib/worker");

  console.log(`[repo-health] queue scheduler started (draining every ${intervalMs}ms)`);

  let draining = false;

  const drainQueue = async () => {
    if (draining) {
      return;
    }
    draining = true;

    try {
      let processed = 0;

      for (;;) {
        const outcome = await processNextQueuedTask();

        if (!outcome.processed) {
          break;
        }

        processed += 1;

        if (outcome.ok) {
          console.log(`[repo-health] task ${outcome.taskId} completed (${outcome.result.repo})`);
        } else {
          console.error(`[repo-health] task ${outcome.taskId} failed: ${outcome.error}`);
        }

        if (processed >= 50) {
          console.warn("[repo-health] scheduler reached the per-tick safety cap of 50 tasks");
          break;
        }
      }
    } catch (error) {
      console.error(
        "[repo-health] scheduler tick failed:",
        error instanceof Error ? error.message : error
      );
    } finally {
      draining = false;
    }
  };

  setInterval(() => {
    void drainQueue();
  }, intervalMs);
}
