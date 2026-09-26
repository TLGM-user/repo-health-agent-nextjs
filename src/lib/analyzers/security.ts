import { fetchGitHubJsonSafe } from "@/lib/github-app";
import type { AnalyzerFinding, AnalyzerResult } from "./types";

type DependabotAlert = {
  number: number;
  state: string;
  dependency?: { package_name?: string };
  security_advisory?: { severity?: string | null; summary?: string | null };
};

type CodeScanningAlert = {
  number: number;
  state: string;
  severity?: string | null;
  security_severity_level?: string | null;
  rule?: { description?: string | null };
  most_recent_instance?: { location?: { path?: string | null } };
};

type SecretScanningAlert = {
  number: number;
  state: string;
  secret_type_display_name?: string | null;
  resolution?: string | null;
};

type Severity = "critical" | "high" | "medium" | "low";

type AlertCount = Record<Severity, number>;

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_PENALTY: Record<Severity, number> = { critical: 30, high: 12, medium: 5, low: 2 };

const SEVERITY_LABEL: Record<Severity, "Critical" | "High" | "Medium" | "Low"> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function normalizeSeverity(raw: string | null | undefined): Severity {
  const value = (raw ?? "").toLowerCase();
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  // code-scanning's non-security severity ladder maps onto the same scale
  if (value === "error") return "high";
  if (value === "warning") return "medium";
  if (value === "note" || value === "info") return "low";
  return "medium";
}

function toFinding(
  severity: Severity,
  title: string,
  description: string
): AnalyzerFinding {
  return { title, severity: SEVERITY_LABEL[severity], description };
}

export async function runSecurityAnalyzer(repo: string, ref: string, token?: string): Promise<AnalyzerResult> {
  const base = `https://api.github.com/repos/${repo}`;

  const [dependabot, codeScanning, secretScanning] = await Promise.all([
    fetchGitHubJsonSafe<DependabotAlert[]>(`${base}/dependabot/alerts?state=open&per_page=100`, token),
    fetchGitHubJsonSafe<CodeScanningAlert[]>(`${base}/code-scanning/alerts?state=open&per_page=100`, token),
    fetchGitHubJsonSafe<SecretScanningAlert[]>(`${base}/secret-scanning/alerts?state=open&per_page=100`, token),
  ]);

  const available: string[] = [];
  const unavailable: string[] = [];

  if (dependabot.ok) available.push("Dependabot");
  else unavailable.push("Dependabot");
  if (codeScanning.ok) available.push("code scanning");
  else unavailable.push("code scanning");
  if (secretScanning.ok) available.push("secret scanning");
  else unavailable.push("secret scanning");

  if (available.length === 0) {
    return {
      id: "security",
      label: "Security",
      status: "unknown",
      score: null,
      value: "Unavailable",
      trend: "needs security_events permission",
      detail:
        "No security alert endpoint could be read (401/403/404). Grant the GitHub App the security_events permission and enable Dependabot alerts on the repository.",
      findings: [],
      actions: ["Enable Dependabot alerts and grant the App security_events access so scans can read real CVE data."],
      metadata: { unavailable },
    };
  }

  const counts: AlertCount = { critical: 0, high: 0, medium: 0, low: 0 };
  const findings: AnalyzerFinding[] = [];

  for (const alert of dependabot.data ?? []) {
    if (alert.state !== "open") continue;
    const severity = normalizeSeverity(alert.security_advisory?.severity);
    counts[severity] += 1;
    if (findings.length < 5) {
      findings.push(
        toFinding(
          severity,
          `Dependabot alert #${alert.number}`,
          `${alert.dependency?.package_name ?? "dependency"}: ${alert.security_advisory?.summary ?? "vulnerable dependency"}.`
        )
      );
    }
  }

  for (const alert of codeScanning.data ?? []) {
    if (alert.state !== "open") continue;
    const severity = normalizeSeverity(alert.security_severity_level ?? alert.severity);
    counts[severity] += 1;
    if (findings.length < 5) {
      const path = alert.most_recent_instance?.location?.path;
      findings.push(
        toFinding(
          severity,
          `Code scanning alert #${alert.number}`,
          `${alert.rule?.description ?? "Code scanning finding"}${path ? ` (${path})` : ""}.`
        )
      );
    }
  }

  for (const alert of secretScanning.data ?? []) {
    if (alert.state !== "open" || alert.resolution) continue;
    // An unresolved leaked credential is treated as high severity by default.
    counts.high += 1;
    if (findings.length < 5) {
      findings.push(
        toFinding(
          "high",
          `Secret scanning alert #${alert.number}`,
          `Unresolved secret: ${alert.secret_type_display_name ?? "credential"} detected in the repository.`
        )
      );
    }
  }

  const total = counts.critical + counts.high + counts.medium + counts.low;
  const penalty =
    counts.critical * SEVERITY_PENALTY.critical +
    counts.high * SEVERITY_PENALTY.high +
    counts.medium * SEVERITY_PENALTY.medium +
    counts.low * SEVERITY_PENALTY.low;
  const score = Math.max(5, 100 - Math.min(95, penalty));

  const ordered = (["critical", "high", "medium", "low"] as Severity[])
    .filter((severity) => counts[severity] > 0)
    .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b]);

  const status: AnalyzerResult["status"] =
    total === 0 ? "pass" : counts.critical > 0 || counts.high > 0 ? "fail" : counts.medium > 0 ? "warn" : "pass";

  const actions: string[] = [];
  if (counts.critical + counts.high > 0) {
    actions.push("Triage critical/high security alerts and cut a patch release for affected dependencies.");
  } else if (counts.medium > 0) {
    actions.push("Schedule medium-severity alerts into the next maintenance window.");
  }
  if (unavailable.length > 0) {
    actions.push(`Grant access to ${unavailable.join(", ")} so future scans cover those signals.`);
  }
  if (total === 0 && actions.length === 0) {
    actions.push("Keep security scanning enabled; no open alerts right now.");
  }

  return {
    id: "security",
    label: "Security",
    status,
    score,
    value: `${total} open alert${total === 1 ? "" : "s"}`,
    trend:
      ordered.length > 0
        ? ordered.map((severity) => `${counts[severity]} ${severity}`).join(" · ")
        : `checked ${available.join(", ")}`,
    detail:
      total === 0
        ? `Read ${available.join(", ")}: no open security alerts.`
        : `${total} open alert${total === 1 ? "" : "s"} across ${available.join(", ")}: ${ordered
            .map((severity) => `${counts[severity]} ${severity}`)
            .join(", ")}.${unavailable.length > 0 ? ` Not readable: ${unavailable.join(", ")}.` : ""}`,
    findings,
    actions,
    metadata: { counts, available, unavailable, ref },
  };
}
