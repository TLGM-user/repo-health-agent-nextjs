import { createHmac, timingSafeEqual, createPrivateKey, createSign } from "crypto";

export type GitHubWebhookEvent =
  | "ping"
  | "installation"
  | "installation_repositories"
  | "push"
  | "pull_request"
  | "check_suite"
  | "workflow_run";

export type GitHubRepositoryMetadata = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  size: number;
  archived: boolean;
  updated_at: string;
  pushed_at: string;
};

export type GitHubPullRequestSummary = {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  created_at: string;
  user?: {
    login: string;
  } | null;
};

export function verifyGithubWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("GITHUB_WEBHOOK_SECRET is not configured.");
  }

  if (!signatureHeader) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export function getGitHubAppConfig() {
  return {
    appId: process.env.GITHUB_APP_ID,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
  };
}

export function normalizeGitHubRepoName(repo: string) {
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/$/, "");
}

export function createGitHubAppJwt() {
  const { appId, privateKey } = getGitHubAppConfig();

  if (!appId || !privateKey) {
    throw new Error("GitHub App credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    })
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256").update(signingInput).end();

  return `${signingInput}.${signer.sign(createPrivateKey(privateKey), "base64url")}`;
}

export type InstallationTokenResponse = {
  token: string;
  expires_at: string;
  permissions?: Record<string, string>;
  repository_selection?: string;
};

export async function exchangeInstallationToken(installationId: number) {
  const appJwt = createGitHubAppJwt();

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "repo-health-agent",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub App token exchange failed (${response.status}): ${errorText || "Unknown error"}`
    );
  }

  return (await response.json()) as InstallationTokenResponse;
}

async function fetchGitHubJson<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});

  if (token || process.env.GITHUB_TOKEN) {
    headers.set("Authorization", `Bearer ${token ?? process.env.GITHUB_TOKEN}`);
  }

  headers.set("Accept", "application/vnd.github+json");
  headers.set("User-Agent", "repo-health-agent");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${errorText || "Unknown error"}`);
  }

  return (await response.json()) as T;
}

export async function fetchRepositoryMetadata(repo: string, token?: string) {
  const normalizedRepo = normalizeGitHubRepoName(repo);

  return fetchGitHubJson<GitHubRepositoryMetadata>(
    `https://api.github.com/repos/${normalizedRepo}`,
    token
  );
}

export async function fetchOpenPullRequests(repo: string, token?: string) {
  const normalizedRepo = normalizeGitHubRepoName(repo);

  return fetchGitHubJson<GitHubPullRequestSummary[]>(
    `https://api.github.com/repos/${normalizedRepo}/pulls?state=open&per_page=10`,
    token
  );
}

export function isSupportedGitHubEvent(eventName: string): eventName is GitHubWebhookEvent {
  return [
    "ping",
    "installation",
    "installation_repositories",
    "push",
    "pull_request",
    "check_suite",
    "workflow_run",
  ].includes(eventName);
}
