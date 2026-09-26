import { listRepositoriesForInstallation, saveTask } from "@/lib/persistence";

export async function POST(
  request: Request,
  context: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await context.params;
    const installationIdNumber = Number(installationId);

    if (!Number.isFinite(installationIdNumber)) {
      return Response.json(
        {
          error: "A valid installationId is required.",
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const repoFilter = searchParams.get("repo");
    const repositories = await listRepositoriesForInstallation(installationIdNumber);
    const filteredRepos = repoFilter
      ? repositories.filter((repo) => repo.full_name === repoFilter)
      : repositories;

    if (filteredRepos.length === 0) {
      return Response.json(
        {
          error: "No repositories are registered for this installation.",
        },
        { status: 404 }
      );
    }

    const tasks = await Promise.all(
      filteredRepos.map(async (repo) =>
        saveTask({
          id: crypto.randomUUID(),
          repo: repo.full_name,
          mode: "github-webhook",
          type: "repo-health",
          status: "queued",
          payload: {
            installationId: installationIdNumber,
            source: "admin",
            repositoryId: repo.id,
            repoName: repo.full_name,
          },
        })
      )
    );

    return Response.json(
      {
        installationId: installationIdNumber,
        queued: tasks.length,
        tasks,
      },
      { status: 202 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to queue installation repo analysis.",
      },
      { status: 500 }
    );
  }
}
