import { listTasks, updateTaskStatus } from "@/lib/persistence";
import { processTask } from "@/lib/worker";

export async function POST() {
  try {
    const tasks = await listTasks();
    const nextTask = tasks.find((task) => task.status === "queued");

    if (!nextTask) {
      return Response.json(
        {
          message: "No queued tasks to process.",
          task: null,
        },
        { status: 200 }
      );
    }

    await updateTaskStatus(nextTask.id, "processing");

    const result = processTask({
      id: nextTask.id,
      repo: nextTask.repo,
      mode: nextTask.mode,
      type: nextTask.type,
      payload: nextTask.payload,
      status: nextTask.status,
      createdAt: nextTask.createdAt,
      updatedAt: nextTask.updatedAt,
    });

    await updateTaskStatus(nextTask.id, "completed", { result });

    return Response.json(
      {
        message: "Task processed successfully.",
        task: result,
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Worker processing failed.",
      },
      { status: 500 }
    );
  }
}
