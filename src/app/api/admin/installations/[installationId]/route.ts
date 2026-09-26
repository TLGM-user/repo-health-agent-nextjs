import { listInstallations, listRepositoriesForInstallation } from "@/lib/persistence";

export async function GET(
  _request: Request,
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

    const installations = await listInstallations();
    const installation = installations.find(
      (item) => Number(item["installationId"]) === installationIdNumber
    );

    if (!installation) {
      return Response.json(
        {
          error: "Installation not found.",
        },
        { status: 404 }
      );
    }

    const repositories = await listRepositoriesForInstallation(installationIdNumber);

    return Response.json({
      installation: {
        ...installation,
        repositories,
      },
      repositories,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load installation details.",
      },
      { status: 500 }
    );
  }
}
