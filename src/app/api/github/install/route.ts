import { listInstallations, saveInstallation } from "@/lib/persistence";

export async function GET() {
  try {
    const installations = await listInstallations();

    return Response.json({
      installations,
      count: installations.length,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to list GitHub installations.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      installationId?: number;
      owner?: string;
      repo?: string;
      accountType?: "User" | "Organization";
      status?: "active" | "disabled" | "pending";
    };

    if (!body.installationId || !body.owner) {
      return Response.json(
        {
          error: "Installation ID and owner are required.",
        },
        { status: 400 }
      );
    }

    const installation = await saveInstallation({
      installationId: Number(body.installationId),
      owner: body.owner,
      repo: body.repo,
      accountType: body.accountType ?? "Organization",
      status: body.status ?? "active",
    });

    return Response.json(
      {
        message: "GitHub app installation registered successfully.",
        installation,
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "The GitHub installation payload could not be processed.",
      },
      { status: 400 }
    );
  }
}
