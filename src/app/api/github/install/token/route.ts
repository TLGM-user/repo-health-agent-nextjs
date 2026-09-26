import { getInstallationTokenOrRefresh } from "@/lib/github-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      installationId?: number;
    };

    if (!body.installationId || !Number.isFinite(Number(body.installationId))) {
      return Response.json(
        {
          error: "A valid installationId is required.",
        },
        { status: 400 }
      );
    }

    const installationId = Number(body.installationId);
    const tokenResponse = await getInstallationTokenOrRefresh(installationId);

    return Response.json(
      {
        installationId,
        token: tokenResponse.token,
        expiresAt: tokenResponse.expires_at,
        permissions: tokenResponse.permissions ?? {},
        repositorySelection: tokenResponse.repository_selection ?? "all",
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "GitHub installation token exchange failed.",
      },
      { status: 500 }
    );
  }
}
