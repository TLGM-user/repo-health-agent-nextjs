import { exchangeInstallationToken, type InstallationTokenResponse } from "@/lib/github-app";
import { deleteInstallationToken, getInstallationToken, saveInstallationToken } from "@/lib/persistence";

/** Refresh tokens this many milliseconds before GitHub expires them (tokens live ~1h). */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * In-flight refreshes keyed by installation id, so concurrent requests for the
 * same installation share a single token exchange instead of racing to mint
 * multiple tokens.
 */
const inFlightRefreshes = new Map<number, Promise<InstallationTokenResponse>>();

function isUsable(response: Pick<InstallationTokenResponse, "expires_at">) {
  const expiresAt = new Date(response.expires_at).getTime();

  return Number.isFinite(expiresAt) && expiresAt - EXPIRY_BUFFER_MS > Date.now();
}

function toInstallationTokenResponse(row: {
  token: string;
  expiresAt: string;
  permissions?: Record<string, string> | string | null;
  repositorySelection?: string | null;
}): InstallationTokenResponse {
  const permissions =
    typeof row.permissions === "string"
      ? (JSON.parse(row.permissions) as Record<string, string>)
      : (row.permissions ?? {});

  return {
    token: row.token,
    expires_at: new Date(row.expiresAt).toISOString(),
    permissions,
    repository_selection: row.repositorySelection ?? "all",
  };
}

async function refreshInstallationToken(installationId: number) {
  const fresh = await exchangeInstallationToken(installationId);

  try {
    await saveInstallationToken({
      installationId,
      token: fresh.token,
      expiresAt: fresh.expires_at,
      permissions: fresh.permissions ?? {},
      repositorySelection: fresh.repository_selection ?? "all",
    });
  } catch (error) {
    // The token itself is valid — a cache write failure must not break the caller.
    console.error(
      `Failed to persist installation token for ${installationId}:`,
      error instanceof Error ? error.message : error
    );
  }

  return fresh;
}

/**
 * Returns a valid installation access token, reusing the cached one when it is
 * still fresh and transparently refreshing (and persisting) it otherwise.
 *
 * The GitHub exchange is authoritative and always works; the Postgres cache is
 * best-effort, so a missing/unavailable database degrades to a direct exchange.
 */
export async function getInstallationTokenOrRefresh(
  installationId: number
): Promise<InstallationTokenResponse> {
  try {
    const cached = await getInstallationToken(installationId);

    if (cached) {
      const response = toInstallationTokenResponse(cached);

      if (isUsable(response)) {
        return response;
      }
    }
  } catch (error) {
    console.error(
      `Installation token cache unavailable for ${installationId}:`,
      error instanceof Error ? error.message : error
    );
  }

  const pending = inFlightRefreshes.get(installationId);

  if (pending) {
    return pending;
  }

  const refresh = refreshInstallationToken(installationId).finally(() => {
    inFlightRefreshes.delete(installationId);
  });

  inFlightRefreshes.set(installationId, refresh);

  return refresh;
}

/** Drops any cached token for an installation (used on uninstall/suspend). */
export async function invalidateInstallationToken(installationId: number) {
  try {
    await deleteInstallationToken(installationId);
  } catch (error) {
    console.error(
      `Failed to invalidate installation token for ${installationId}:`,
      error instanceof Error ? error.message : error
    );
  }
}
