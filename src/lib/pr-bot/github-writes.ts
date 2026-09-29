import { fetchGitHubJson, normalizeGitHubRepoName } from "../github-app";
import type { PrPreview } from "./pr-bot";

/** Hard cap: one apply PR deletes at most this many files. */
export const MAX_APPLY_FILES = 10;

export type ApplyTarget = { path: string };

/**
 * Pure target selection: only signed P0 dead-code paths, deduplicated,
 * capped. Anything else in the submitted preview is dropped — the caller
 * reports the drop count for audit.
 */
export function selectApplyTargets(preview: PrPreview, maxFiles = MAX_APPLY_FILES): {
  targets: ApplyTarget[];
  dropped: number;
} {
  const seen = new Set<string>();
  const targets: ApplyTarget[] = [];
  let dropped = 0;
  const eligiblePaths = new Set(
    preview.eligible
      .filter((i) => i.tier === "P0-autofix-safe" && i.autofixable && i.confidence === "high" && i.path)
      .map((i) => i.path as string)
  );
  for (const path of preview.files ?? []) {
    if (typeof path !== "string" || !path || path.includes("..") || path.startsWith("/") || seen.has(path)) {
      dropped += 1;
      continue;
    }
    if (!eligiblePaths.has(path)) {
      dropped += 1; // not a signed P0 target — never delete
      continue;
    }
    seen.add(path);
    if (targets.length < maxFiles) targets.push({ path });
    else dropped += 1;
  }
  return { targets, dropped };
}

function contentsUrl(repo: string, path: string): string {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://api.github.com/repos/${repo}/contents/${encoded}`;
}

async function github<T>(url: string, token: string, method: string, body?: unknown): Promise<T> {
  return fetchGitHubJson<T>(url, token, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export type ApplyResult = {
  repo: string;
  base: string;
  baseSha: string;
  branch: string;
  deleted: string[];
  prNumber: number;
  prUrl: string;
  dropped: number;
};

/**
 * Executes an approved preview: creates a branch off the default branch,
 * deletes the selected dead-code files one commit per file (clear revert
 * trail), and opens a PR. Throws with the upstream GitHub status on
 * permission errors (caller maps to HTTP codes).
 */
export async function applyDeadCodeRemovals(input: {
  preview: PrPreview;
  token: string;
  base?: string;
}): Promise<ApplyResult> {
  const repo = normalizeGitHubRepoName(input.preview.repo);
  const { targets, dropped } = selectApplyTargets(input.preview);
  if (targets.length === 0) {
    throw new Error("No eligible P0 dead-code targets in this preview — nothing to apply.");
  }

  const metadata = await github<{ default_branch: string }>(
    `https://api.github.com/repos/${repo}`,
    input.token,
    "GET"
  );
  const base = input.base ?? metadata.default_branch;
  const ref = await github<{ object: { sha: string } }>(
    `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`,
    input.token,
    "GET"
  );
  const baseSha = ref.object.sha;

  let branch = input.preview.branch;
  try {
    await github(`https://api.github.com/repos/${repo}/git/refs`, input.token, "POST", {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch (error) {
    // Branch already exists (replayed approval): use a fresh unique branch
    // instead of pushing onto an unknown ref.
    if (error instanceof Error && / 422/.test(error.message)) {
      branch = `${branch}-retry-${Date.now().toString(36)}`;
      await github(`https://api.github.com/repos/${repo}/git/refs`, input.token, "POST", {
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      });
    } else {
      throw error;
    }
  }

  const deleted: string[] = [];
  for (const target of targets) {
    const current = await github<{ sha: string }>(
      `${contentsUrl(repo, target.path)}?ref=${encodeURIComponent(branch)}`,
      input.token,
      "GET"
    );
    await github(contentsUrl(repo, target.path), input.token, "DELETE", {
      message: `chore(repo-health): remove dead code ${target.path}`,
      sha: current.sha,
      branch,
    });
    deleted.push(target.path);
  }

  const pr = await github<{ number: number; html_url: string }>(
    `https://api.github.com/repos/${repo}/pulls`,
    input.token,
    "POST",
    {
      title: input.preview.title,
      head: branch,
      base,
      body: `${input.preview.body}\n\n---\n_Approved apply of run \`${input.preview.runId}\` (${deleted.length} file${deleted.length === 1 ? "" : "s"} removed, one commit each)._`,
      // Drafts are unmergeable until a human marks them ready — the merge
      // gate for green CI + human review. Never auto-merge bot PRs.
      draft: true,
    }
  );

  return { repo, base, baseSha, branch, deleted, prNumber: pr.number, prUrl: pr.html_url, dropped };
}
