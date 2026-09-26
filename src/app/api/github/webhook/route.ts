import {
  exchangeInstallationToken,
  isSupportedGitHubEvent,
  verifyGithubWebhookSignature,
} from "@/lib/github-app";
import { invalidateInstallationToken } from "@/lib/github-auth";
import {
  saveInstallation,
  saveInstallationToken,
  saveRepositoryRegistration,
  saveTask,
} from "@/lib/persistence";

export async function POST(request: Request) {
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  try {
    const isValid = verifyGithubWebhookSignature(rawBody, signature);

    if (!isValid) {
      return Response.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
    }

    const eventName = request.headers.get("x-github-event");

    if (!eventName || !isSupportedGitHubEvent(eventName)) {
      return Response.json({ message: `Unsupported or missing GitHub event: ${eventName ?? "unknown"}` }, { status: 202 });
    }

    const payload = JSON.parse(rawBody) as {
      action?: string;
      repository?: { full_name?: string; name?: string; private?: boolean; default_branch?: string; html_url?: string };
      repositories?: Array<{ full_name?: string; name?: string; private?: boolean; default_branch?: string; html_url?: string }>;
      repositories_added?: Array<{ full_name?: string; name?: string; private?: boolean; default_branch?: string; html_url?: string }>;
      installation?: { id?: number; account?: { login?: string; type?: "User" | "Organization" } };
      ref?: string;
      sender?: { login?: string };
    };

    const installationId = payload.installation?.id;

    if (typeof installationId === "number") {
      const owner = payload.installation?.account?.login ?? payload.sender?.login ?? "unknown";
      const accountType = payload.installation?.account?.type ?? "Organization";

      await saveInstallation({
        installationId,
        owner,
        repo: payload.repository?.full_name ?? payload.repositories?.[0]?.full_name ?? undefined,
        accountType,
        status: payload.action === "deleted" ? "disabled" : "active",
      });

      const isRemoved = payload.action === "deleted" || payload.action === "suspend";

      if (isRemoved) {
        // The installation can no longer mint tokens — drop any cached one so
        // nothing keeps using it after uninstall/suspension.
        await invalidateInstallationToken(installationId);
      } else if (payload.action === "created" || payload.action === "added" || payload.action === "requested") {
        // Best-effort cache pre-warm; failures are non-fatal because tokens are
        // lazily refreshed on demand by getInstallationTokenOrRefresh.
        try {
          const accessToken = await exchangeInstallationToken(installationId);
          await saveInstallationToken({
            installationId,
            token: accessToken.token,
            expiresAt: accessToken.expires_at,
            permissions: accessToken.permissions ?? {},
            repositorySelection: accessToken.repository_selection ?? "all",
          });
        } catch (error) {
          console.error(
            `Failed to pre-warm installation token for ${installationId}:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      const reposToPersist = payload.repositories ?? payload.repositories_added ?? [];

      for (const repo of reposToPersist) {
        if (!repo.full_name || !repo.name) {
          continue;
        }

        await saveRepositoryRegistration({
          installationId,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
          htmlUrl: repo.html_url,
          selected: true,
        });
      }

      if (payload.repository?.full_name) {
        await saveRepositoryRegistration({
          installationId,
          name: payload.repository.name ?? payload.repository.full_name.split("/").at(-1) ?? "unknown",
          fullName: payload.repository.full_name,
          private: payload.repository.private,
          defaultBranch: payload.repository.default_branch,
          htmlUrl: payload.repository.html_url,
          selected: true,
        });
      }
    }

    const repoName = payload.repository?.full_name ?? "unknown/repo";
    const taskId = crypto.randomUUID();
    const task = await saveTask({
      id: taskId,
      repo: repoName,
      mode: "github-webhook",
      type: "repo-health",
      payload: {
        event: eventName,
        action: payload.action ?? "received",
        ref: payload.ref ?? null,
        installationId: installationId ?? null,
        sender: payload.sender?.login ?? null,
      },
      status: "queued",
    });

    return Response.json(
      {
        message: "GitHub webhook received and queued for processing.",
        event: eventName,
        taskId: task.id,
      },
      { status: 202 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to process GitHub webhook payload.",
      },
      { status: 400 }
    );
  }
}
