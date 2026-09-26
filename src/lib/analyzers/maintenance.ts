import type { GitHubPullRequestSummary, GitHubRepositoryMetadata, GitHubTree } from "@/lib/github-app";
import type { AnalyzerFinding, AnalyzerResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const README_PATTERN = /^README(\.(md|rst|txt))?$/i;
const LICENSE_PATTERN = /^(LICENSE|LICENCE|COPYING)(\.[^/]+)?$/i;

function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / DAY_MS);
}

function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

export function runMaintenanceAnalyzer(input: {
  metadata: GitHubRepositoryMetadata | null;
  tree: GitHubTree | null;
  pulls?: GitHubPullRequestSummary[];
}): AnalyzerResult {
  const { metadata, tree, pulls = [] } = input;

  if (!metadata) {
    return {
      id: "maintenance",
      label: "Maintenance",
      status: "unknown",
      score: null,
      value: "Unavailable",
      trend: "metadata unreadable",
      detail: "Repository metadata could not be fetched, so activity signals were not evaluated.",
      findings: [],
      actions: [],
      metadata: {},
    };
  }

  const rootFiles = new Set(
    (tree?.tree ?? [])
      .filter((entry) => entry.type === "blob" && !entry.path.includes("/"))
      .map((entry) => entry.path)
  );
  const hasReadme = [...rootFiles].some((name) => README_PATTERN.test(name));
  const hasLicense = [...rootFiles].some((name) => LICENSE_PATTERN.test(name));

  const pushAgeDays = daysSince(metadata.pushed_at);
  const openIssues = metadata.open_issues_count ?? 0;
  const archived = metadata.archived;

  // Activity-age score with small adjustments for documentation/compliance signals.
  let score = 100;
  if (pushAgeDays === null) score = 50;
  else if (pushAgeDays > 365) score = 35;
  else if (pushAgeDays > 180) score = 55;
  else if (pushAgeDays > 90) score = 72;
  else if (pushAgeDays > 21) score = 86;
  else score = 96;

  if (!hasReadme) score -= 4;
  if (!hasLicense) score -= 4;
  if (openIssues > 25) score -= 4;
  if (archived) score = Math.min(score, 15);
  score = Math.max(10, Math.min(99, score));

  const status: AnalyzerResult["status"] = archived
    ? "fail"
    : score >= 80
      ? "pass"
      : score >= 60
        ? "warn"
        : "fail";

  const findings: AnalyzerFinding[] = [];
  const actions: string[] = [];

  if (archived) {
    findings.push({
      title: "Repository is archived",
      severity: "High",
      description: `${metadata.full_name} is read-only; no further maintenance is possible until it is unarchived.`,
    });
    actions.push("Decide whether to unarchive the repository or stop monitoring it.");
  }

  if (pushAgeDays !== null && pushAgeDays > 365 && !archived) {
    findings.push({
      title: "Dormant repository",
      severity: "High",
      description: `No pushes to ${metadata.default_branch} in ${relativeDays(pushAgeDays)} (${pushAgeDays} days).`,
    });
    actions.push("Re-establish a release cadence or archive the repository explicitly to signal its status.");
  } else if (pushAgeDays !== null && pushAgeDays > 90 && !archived) {
    findings.push({
      title: "Slowing activity",
      severity: "Medium",
      description: `Last push was ${relativeDays(pushAgeDays)} — well outside a typical sprint cadence.`,
    });
  }

  if (!hasLicense) {
    findings.push({
      title: "No license file",
      severity: "Low",
      description: "No LICENSE/COPYING file at the repository root — reuse and compliance are ambiguous.",
    });
    actions.push("Add a LICENSE file so consumers know the terms of use.");
  }

  if (!hasReadme) {
    findings.push({
      title: "No README file",
      severity: "Low",
      description: "No README at the repository root; onboarding and support burden falls on the maintainers.",
    });
    actions.push("Add a README covering setup, architecture, and contribution basics.");
  }

  if (openIssues > 25) {
    findings.push({
      title: "Large issue backlog",
      severity: "Medium",
      description: `${openIssues} open issues are queued against the repository.`,
    });
    actions.push("Triage the issue backlog and close or milestone stale items.");
  }

  if (actions.length === 0) {
    actions.push("Activity cadence looks healthy — keep releases and notes current.");
  }

  return {
    id: "maintenance",
    label: "Maintenance",
    status,
    score,
    value: pushAgeDays === null ? "No push data" : `pushed ${relativeDays(pushAgeDays)}`,
    trend: archived
      ? "archived"
      : `${openIssues} open issues · ${metadata.default_branch}${pulls.length > 0 ? ` · ${pulls.length} open PRs sampled` : ""}`,
    detail:
      `Last push ${pushAgeDays === null ? "unknown" : relativeDays(pushAgeDays)} on ${metadata.default_branch}. ` +
      `README ${hasReadme ? "present" : "missing"}, license ${hasLicense ? "present" : "missing"}, ` +
      `${openIssues} open issues${metadata.archived ? ", repository archived" : ""}.`,
    findings,
    actions,
    metadata: {
      archived,
      pushedAt: metadata.pushed_at,
      pushAgeDays,
      hasReadme,
      hasLicense,
      openIssues,
      defaultBranch: metadata.default_branch,
    },
  };
}
