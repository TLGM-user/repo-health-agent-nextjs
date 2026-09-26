import { analyzeRepo, type ScanMode } from "@/lib/repo-health";
import { saveAnalysisResult } from "@/lib/persistence";
import { normalizeGitHubRepoName } from "@/lib/github-app";

export async function GET() {
  const repo = "acme/platform-service";
  const result = analyzeRepo(repo, "scheduled");

  await saveAnalysisResult({
    id: crypto.randomUUID(),
    repo: normalizeGitHubRepoName(repo),
    mode: "scheduled",
    status: result.status,
    score: result.score,
    summary: result.summary,
    checks: result.checks,
    findings: result.findings,
    actions: result.actions,
    metadata: {
      endpoint: "GET /api/repo-health",
    },
  });

  return Response.json(result, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      repo?: string;
      mode?: ScanMode;
      installationId?: number;
    };

    const repo = body.repo?.trim();
    const mode = body.mode ?? "on-demand";

    if (!repo) {
      return Response.json(
        {
          error: "A repository name or URL is required.",
        },
        { status: 400 }
      );
    }

    const normalizedRepo = normalizeGitHubRepoName(repo);
    const result = analyzeRepo(normalizedRepo, mode);

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
      },
    });

    return Response.json(result, { status: 200 });
  } catch {
    return Response.json(
      {
        error: "The repo scan request could not be processed.",
      },
      { status: 400 }
    );
  }
}
