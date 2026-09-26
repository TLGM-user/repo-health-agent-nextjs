import {
  listAnalysisResults,
  listInstallations,
  listRepositoriesForInstallation,
} from "@/lib/persistence";

export async function GET() {
  try {
    const installations = await listInstallations();
    const analysisResults = await listAnalysisResults();

    const enriched = await Promise.all(
      installations.map(async (installation) => {
        const repos = await listRepositoriesForInstallation(Number(installation["installationId"]));

        const repositorySummaries = repos.map((repo) => {
          const latestAnalysis = [...analysisResults]
            .filter((result) => result.repo === repo.full_name)
            .sort(
              (a, b) =>
                new Date(b["createdAt"]).getTime() - new Date(a["createdAt"]).getTime()
            )[0];

          return {
            ...repo,
            latestAnalysis: latestAnalysis ?? null,
          };
        });

        return {
          ...installation,
          repositories: repositorySummaries,
        };
      })
    );

    return Response.json({
      installations: enriched,
      count: enriched.length,
      repositoryCount: enriched.reduce((total, installation) => total + installation.repositories.length, 0),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load installation records.",
      },
      { status: 500 }
    );
  }
}
