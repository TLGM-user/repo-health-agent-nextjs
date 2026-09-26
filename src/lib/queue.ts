export type QueueTaskStatus = "queued" | "processing" | "completed" | "failed";

export type QueueTask = {
  id: string;
  repo: string;
  mode: "scheduled" | "on-demand" | "cli" | "github-webhook";
  type: "repo-health" | "dependency-update" | "security-scan";
  payload: Record<string, unknown>;
  status: QueueTaskStatus;
  createdAt: string;
  updatedAt: string;
};

class TaskQueue {
  private tasks = new Map<string, QueueTask>();
  private queue: string[] = [];

  enqueue(task: Omit<QueueTask, "id" | "status" | "createdAt" | "updatedAt">): QueueTask {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const queuedTask: QueueTask = {
      ...task,
      id,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(id, queuedTask);
    this.queue.push(id);

    return queuedTask;
  }

  list(): QueueTask[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getById(id: string) {
    return this.tasks.get(id);
  }

  popNext(): QueueTask | null {
    const nextId = this.queue.shift();

    if (!nextId) {
      return null;
    }

    const task = this.tasks.get(nextId);

    if (!task) {
      return null;
    }

    task.status = "processing";
    task.updatedAt = new Date().toISOString();

    return task;
  }

  complete(id: string, payload?: Record<string, unknown>) {
    const task = this.tasks.get(id);

    if (!task) {
      return null;
    }

    task.status = "completed";
    task.updatedAt = new Date().toISOString();

    if (payload) {
      task.payload = { ...task.payload, ...payload };
    }

    return task;
  }

  fail(id: string, message?: string) {
    const task = this.tasks.get(id);

    if (!task) {
      return null;
    }

    task.status = "failed";
    task.updatedAt = new Date().toISOString();

    if (message) {
      task.payload = { ...task.payload, error: message };
    }

    return task;
  }
}

export const taskQueue = new TaskQueue();
