import { getInstallationTokenOrRefresh } from "@/lib/github-auth";
import { verifyPrPreview, type PrPreview } from "@/lib/pr-bot/pr-bot";
import { applyDeadCodeRemovals } from "@/lib/pr-bot/github-writes";
import { getFixRun, isFixRunExpired, updateFixRun } from "@/lib/persistence";

/**
 * POST /api/fixes/apply — approval-gated fix execution.
 * Body: { preview (unchanged object from POST /api/fixes/preview), installationId, base? }.
 *
 * 1. Re-verifies the preview HMAC (repo + branch + title + file list).
 * 2. When a fix_runs audit record exists: rejects expired previews (>24h),
 *    rejects replays of already-applied runs (409), and records the outcome.
 *    Without a DB the route stays stateless and relies on the HMAC alone.
 * 3. Requires a GitHub App installationId — writes use the short-lived
 *    installation token only (needs Contents:Write + Pull requests:Write).
 *    No GITHUB_TOKEN fallback: a broad PAT must never drive deletions.
 * 4. Deletes at most MAX_APPLY_FILES P0 files, one commit each, opens a
 *    DRAFT PR (unmergeable until a human marks it ready after green CI).
 */
export async function POST(request: Request) {
  let body: { preview?: PrPreview; installationId?: number; base?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "A JSON body with { preview, installationId } is required." }, { status: 400 });
  }

  if (!body.preview || typeof body.preview !== "object") {
    return Response.json({ error: "The unchanged preview object from POST /api/fixes/preview is required." }, { status: 400 });
  }
  if (!body.installationId || !Number.isFinite(Number(body.installationId))) {
    return Response.json(
      { error: "installationId is required — automated deletions only run under a least-privilege GitHub App installation token." },
      { status: 400 }
    );
  }
  if (!verifyPrPreview(body.preview)) {
    return Response.json(
      { error: "Preview signature invalid — the preview was modified after signing or was not issued by this server. Request a fresh preview." },
      { status: 422 }
    );
  }

  const runUuid = body.preview.runId.split(".")[0] as string;
  let audited = false;
  try {
    const record = await getFixRun(runUuid);
    if (record) {
      audited = true;
      if (record.status === "applied") {
        return Response.json(
          { error: `This approval was already applied (PR #${record["prNumber"] ?? "?"}). Request a fresh preview for further cleanups.` },
          { status: 409 }
        );
      }
      if (isFixRunExpired(record["createdAt"])) {
        await updateFixRun(runUuid, { status: "failed" });
        return Response.json(
          { error: "Preview expired (>24h old) — the codebase may have changed since the scan. Request a fresh preview." },
          { status: 422 }
        );
      }
    }
  } catch (auditError) {
    // No DB configured (or audit read failed): stay stateless, HMAC-only.
    console.warn("[fixes] fix_runs audit read skipped:", auditError instanceof Error ? auditError.message : auditError);
  }

  try {
    const { token } = await getInstallationTokenOrRefresh(Number(body.installationId));
    const result = await applyDeadCodeRemovals({
      preview: body.preview,
      token,
      base: body.base,
    });
    try {
      await updateFixRun(runUuid, {
        status: "applied",
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        installationId: Number(body.installationId),
      });
    } catch (auditError) {
      console.warn("[fixes] fix_runs audit update skipped:", auditError instanceof Error ? auditError.message : auditError);
    }
    return Response.json(
      {
        repo: result.repo,
        branch: result.branch,
        base: result.base,
        baseSha: result.baseSha,
        deleted: result.deleted,
        dropped: result.dropped,
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        draft: true,
        audited,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The apply request could not be processed.";
    try {
      await updateFixRun(runUuid, { status: "failed", installationId: Number(body.installationId) });
    } catch {
      // Audit is best-effort; the error response below is authoritative.
    }
    const upstream = message.match(/GitHub API request failed \((\d{3})/);
    const status = upstream
      ? upstream[1] === "404"
        ? 404
        : upstream[1] === "401" || upstream[1] === "403"
          ? 403
          : upstream[1] === "422"
            ? 422
            : 502
      : message.includes("No eligible P0")
        ? 422
        : 502;
    const hint =
      status === 403
        ? "Grant the GitHub App Contents:Write and Pull requests:Write on this repository, then approve again."
        : undefined;
    return Response.json(hint ? { error: message, hint } : { error: message }, { status });
  }
}
