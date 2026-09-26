import { processNextQueuedTask } from "@/lib/worker";

export async function POST() {
  try {
    const outcome = await processNextQueuedTask();

    if (!outcome.processed) {
      return Response.json(
        {
          message:
            outcome.reason === "worker-busy"
              ? "A task is already being processed."
              : "No queued tasks to process.",
          task: null,
        },
        { status: 200 }
      );
    }

    if (!outcome.ok) {
      return Response.json(
        {
          message: "Task processing failed.",
          taskId: outcome.taskId,
          error: outcome.error,
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        message: "Task processed successfully.",
        task: outcome.result,
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Worker processing failed.",
      },
      { status: 500 }
    );
  }
}
