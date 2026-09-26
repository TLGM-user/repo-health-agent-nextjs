import { listTasks, saveTask } from "@/lib/persistence";

export async function GET() {
  try {
    const tasks = await listTasks();

    return Response.json({
      total: tasks.length,
      tasks,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load tasks.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      repo?: string;
      mode?: "scheduled" | "on-demand" | "cli";
      type?: "repo-health" | "dependency-update" | "security-scan";
    };

    if (!body.repo) {
      return Response.json(
        {
          error: "A repository name is required.",
        },
        { status: 400 }
      );
    }

    const taskId = crypto.randomUUID();
    const task = await saveTask({
      id: taskId,
      repo: body.repo,
      mode: body.mode ?? "on-demand",
      type: body.type ?? "repo-health",
      payload: {
        source: "api",
        requestedAt: new Date().toISOString(),
      },
      status: "queued",
    });

    return Response.json(
      {
        taskId: task.id,
        status: task.status,
        repo: task.repo,
        createdAt: task.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "The task request could not be processed.",
      },
      { status: 400 }
    );
  }
}
