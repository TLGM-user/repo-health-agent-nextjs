import { normalizeGitHubRepoName } from "@/lib/github-app";
import { getInstallationTokenOrRefresh } from "@/lib/github-auth";
import { runRepoHealthAnalysis, type ScanMode } from "@/lib/repo-health";
import { buildPrPreview } from "@/lib/pr-bot/pr-bot";
import { prioritizeFindings, type ScoredFinding } from "@/lib/prioritize";
import { saveFixRun } from "@/lib/persistence";
import type { AnalyzerResult } from "@/lib/analyzers/types";

/**
 * POST /api/fixes/preview — dry-runOnly fix proposal.
 * Runs the full analyzer suite (now including dead-code + secrets), scores
 * every finding through the prioritization engine, and returns a signed PR
 * preview. Creates no branches, commits, or PRs — human approval required.
 */
export async function POST(request: Request) {
  let body: { repo?: string; mode?: string; installationId?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const repo = body.repo?.trim();
  if (!repo) {
    return Response.json({ error: "A repository name or URL is required." }, { status: 400 });
  }
  const mode: ScanMode = body.mode === "scheduled" || body.mode === "cli" ? body.mode : "on-demand";

  try {
    let token: string | undefined;
    if (body.installationId && Number.isFinite(Number(body.installationId))) {
      token = (await getInstallationTokenOrRefresh(Number(body.installationId))).token;
    } else if (process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN;
    }

    const normalizedRepo = normalizeGitHubRepoName(repo);
    const { result, results } = await runRepoHealthAnalysis({ repo: normalizedRepo, mode, token });

    const runUuid = crypto.randomUUID();
    const preview = buildPrPreview(normalizedRepo, prioritizeFindings(toScored(results)), runUuid);

    // Best-effort audit record: previews stay stateless when no DB is
    // configured, but apply enforces expiry + single-use whenever the
    // record exists.
    try {
      await saveFixRun({
        id: runUuid,
        repo: normalizedRepo,
        mode,
        branch: preview.branch,
        title: preview.title,
        files: preview.files,
        eligibleCount: preview.eligible.length,
        deferredCount: preview.deferred.length,
        status: "preview",
      });
    } catch (auditError) {
      console.warn("[fixes] fix_runs audit write skipped:", auditError instanceof Error ? auditError.message : auditError);
    }

    return Response.json(
      {
        repo: result.repo,
        score: result.score,
        status: result.status,
        preview,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The preview request could not be processed.";
    const upstream = message.match(/GitHub API request failed \((\d{3})/);
    const status = upstream
      ? upstream[1] === "404"
        ? 404
        : upstream[1] === "401" || upstream[1] === "403"
          ? 403
          : 502
      : 502;
    return Response.json({ error: message }, { status });
  }
}

type ScoredInput = Omit<ScoredFinding, "risk" | "tier">;

const SOURCE_CONFIDENCE: Record<string, ScoredInput["confidence"]> = {
  security: "high",
  dependencies: "high",
  secrets: "high",
  tests: "medium",
  maintenance: "medium",
  deadcode: "high",
};

const SOURCE_OF: Record<string, ScoredInput["source"]> = {
  security: "security",
  dependencies: "dependencies",
  tests: "tests",
  maintenance: "maintenance",
  deadcode: "deadcode",
  secrets: "secrets",
};

/** Maps analyzer findings to prioritizer inputs. Only high-confidence dead-code removals are autofixable in MVP. */
function toScored(results: AnalyzerResult[]): ScoredInput[] {
  return results.flatMap((r) => {
    const source = SOURCE_OF[r.id] ?? "maintenance";
    const confidence = r.id === "deadcode" ? "medium" : (SOURCE_CONFIDENCE[r.id] ?? "medium");
    const deadcodeMeta = r.id === "deadcode" ? (r.metadata.candidates as Array<{ path: string; confidence: string; autofixable: boolean }> | undefined) : undefined;
    return r.findings.map((f) => {
      let itemConfidence = confidence;
      let autofixable = false;
      let path: string | undefined;
      if (r.id === "deadcode" && deadcodeMeta) {
        const match = deadcodeMeta.find((c) => f.title.includes(c.path));
        if (match) {
          itemConfidence = match.confidence as ScoredInput["confidence"];
          autofixable = match.autofixable && match.confidence === "high";
          if (autofixable) path = match.path;
        }
      }
      return { finding: f, source, confidence: itemConfidence, autofixable, path };
    });
  });
}

export function __test_only_toScored(results: AnalyzerResult[]) {
  return { scored: toScored(results), prioritized: prioritizeFindings(toScored(results)) };
}
