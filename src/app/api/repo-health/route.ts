import { normalizeGitHubRepoName } from "@/lib/github-app";
import { getInstallationTokenOrRefresh } from "@/lib/github-auth";
import { analyzerMetadata, runRepoHealthAnalysis, type ScanMode } from "@/lib/repo-health";
import { saveAnalysisResult } from "@/lib/persistence";

const SCAN_MODES: ScanMode[] = ["scheduled", "on-demand", "cli"];

export async function GET() {
  return Response.json(
    {
      error:
        "Use POST /api/repo-health with { repo, mode?, installationId? } to run a real analysis.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(request: Request) {
  let body: { repo?: string; mode?: string; installationId?: number };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const repo = body.repo?.trim();

  if (!repo) {
    return Response.json(
      { error: "A repository name or URL is required." },
      { status: 400 }
    );
  }

  const mode: ScanMode = SCAN_MODES.includes(body.mode as ScanMode)
    ? (body.mode as ScanMode)
    : "on-demand";

  try {
    let token: string | undefined;

    if (body.installationId && Number.isFinite(Number(body.installationId))) {
      token = (await getInstallationTokenOrRefresh(Number(body.installationId))).token;
    } else if (process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN;
    }

    const normalizedRepo = normalizeGitHubRepoName(repo);
    const { result, results } = await runRepoHealthAnalysis({ repo: normalizedRepo, mode, token });

    await saveAnalysisResult({
      id: crypto.randomUUID(),
      repo: normalizedRepo,
      mode,
      status: result.status,
      score: result.score,
      summary: result.summary,
      checks: result.checks,
      findings: result.findings,
      actions: result.actions,
      metadata: {
        installationId: body.installationId ?? null,
        source: "repo-health API",
        analyzers: analyzerMetadata(results),
      },
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The repo scan request could not be processed.";

    // Surface GitHub's own status for missing/inaccessible repositories
    // instead of collapsing everything into a generic 400.
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
