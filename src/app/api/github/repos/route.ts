import { fetchOpenPullRequests, fetchRepositoryMetadata } from "@/lib/github-app";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo");
  const installationId = searchParams.get("installationId");

  if (!repo) {
    return Response.json(
      {
        error: "A repository name is required: ?repo=owner/name",
      },
      { status: 400 }
    );
  }

  try {
    let token = process.env.GITHUB_TOKEN;

    if (installationId && Number.isFinite(Number(installationId))) {
      const tokenResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/github/install/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installationId: Number(installationId) }),
        }
      );

      const payload = (await tokenResponse.json()) as { token?: string; error?: string };

      if (!tokenResponse.ok || !payload.token) {
        return Response.json(
          {
            error:
              payload.error ??
              `Installation token exchange failed (${tokenResponse.status}).`,
          },
          { status: 502 }
        );
      }

      token = payload.token;
    }

    if (!token) {
      return Response.json(
        {
          error: "No GitHub credentials are configured for this request.",
        },
        { status: 500 }
      );
    }

    const metadata = await fetchRepositoryMetadata(repo, token);
    const pullRequests = await fetchOpenPullRequests(repo, token);

    return Response.json(
      {
        repo: metadata.full_name,
        metadata,
        pullRequests,
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to retrieve GitHub repository metadata.",
      },
      { status: 500 }
    );
  }
}
