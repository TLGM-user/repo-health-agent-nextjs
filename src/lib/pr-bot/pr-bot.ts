import { createHmac, timingSafeEqual } from "crypto";
import { branchNameFor, changelogEntryFor, prBodyFor, prTitleFor } from "./template";
import { prEligible, type ScoredFinding } from "../prioritize";

export type PrPreview = {
  runId: string;
  repo: string;
  branch: string;
  title: string;
  body: string;
  changelog: string;
  /** Repository-relative paths the approved apply step may delete (P0 only). */
  files: string[];
  eligible: ScoredFinding[];
  deferred: ScoredFinding[];
  signed: boolean;
  requiresApproval: true;
};

function signPayload(payload: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "dev-only-preview-secret";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

/** Canonical signed payload: run id + branch + title + sorted P0 file paths. */
export function previewSignaturePayload(runId: string, branch: string, title: string, files: string[]): string {
  return `${runId}.${branch}.${title}.${[...files].sort().join(",")}`;
}

function splitRunId(runId: string): { uuid: string; signature: string } | null {
  const dot = runId.lastIndexOf(".");
  if (dot <= 0) return null;
  return { uuid: runId.slice(0, dot), signature: runId.slice(dot + 1) };
}

/**
 * Verifies a preview returned by the client for apply: the HMAC must match
 * over run id, branch, title, AND the exact file list. Swapping in a
 * different path (or editing the title/branch binding) fails closed.
 */
export function verifyPrPreview(preview: PrPreview): boolean {
  const parts = splitRunId(preview.runId);
  if (!parts) return false;
  if (!preview.repo || !preview.branch || !Array.isArray(preview.files)) return false;
  const expected = signPayload(previewSignaturePayload(parts.uuid, preview.branch, preview.title, preview.files));
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Dry-run PR generation. No GitHub writes happen here — the caller must take
 * `preview` through human approval, then call POST /api/fixes/apply with the
 * unchanged preview object. Apply re-verifies the signature before writing.
 */
export function buildPrPreview(repo: string, items: ScoredFinding[], runId = crypto.randomUUID()): PrPreview {
  const eligible = prEligible(items);
  const deferred = items.filter((i) => !eligible.includes(i));
  const files = eligible.filter((i) => i.source === "deadcode" && i.path).map((i) => i.path as string);
  const branch = branchNameFor(repo, eligible.length > 0 ? "cleanup" : "report");
  const title = prTitleFor(eligible);
  const body = prBodyFor(repo, eligible, runId);
  const changelog = changelogEntryFor(new Date().toISOString().slice(0, 10), repo, eligible);
  const signature = signPayload(previewSignaturePayload(runId, branch, title, files));
  return {
    runId: `${runId}.${signature}`,
    repo,
    branch,
    title,
    body,
    changelog,
    files,
    eligible,
    deferred,
    signed: true,
    requiresApproval: true,
  };
}
