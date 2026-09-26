export type ScanMode = "scheduled" | "on-demand" | "cli";

export type HealthFinding = {
  title: string;
  severity: "High" | "Medium" | "Low";
  description: string;
};

export type RepoHealthResult = {
  repo: string;
  mode: ScanMode;
  score: number;
  status: "healthy" | "watch" | "critical";
  summary: string;
  checks: Array<{
    label: string;
    value: string;
    trend: string;
  }>;
  findings: HealthFinding[];
  actions: string[];
};

export function analyzeRepo(repo: string, mode: ScanMode): RepoHealthResult {
  const normalizedRepo = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
  const repoSeed = normalizedRepo.length + (normalizedRepo.match(/\//g)?.length ?? 0) * 12;
  const modeWeight = mode === "scheduled" ? 10 : mode === "on-demand" ? 6 : 4;
  const score = Math.min(98, Math.max(42, 92 - (repoSeed % 19) + modeWeight));

  const status = score >= 85 ? "healthy" : score >= 70 ? "watch" : "critical";

  const checks = [
    { label: "Security", value: `${Math.max(62, 96 - (repoSeed % 12))}%`, trend: "+4% vs last run" },
    { label: "Dependencies", value: `${Math.max(50, 88 - (repoSeed % 15))}%`, trend: "3 updates pending" },
    { label: "Test coverage", value: `${Math.max(45, 82 - (repoSeed % 18))}%`, trend: "Needs 2 more suites" },
    { label: "Debt risk", value: `${Math.max(10, 25 + (repoSeed % 21))}%`, trend: "Stable" },
  ];

  const findings: HealthFinding[] = [
    {
      title: "Dependency drift",
      severity: repoSeed % 3 === 0 ? "High" : "Medium",
      description: "Two direct dependencies are behind their recommended safe versions and are affecting upgrade safety.",
    },
    {
      title: "Coverage gaps",
      severity: "Medium",
      description: "Core service modules have no nearby test coverage and are flagged for higher regression risk.",
    },
    {
      title: "Low-risk cleanup",
      severity: "Low",
      description: "Several unused exports and duplication hotspots are eligible for safe automated cleanup.",
    },
  ];

  const actions = [
    "Open a security PR with the latest safe dependency set.",
    "Add a focused test suite around the high-risk business logic.",
    "Apply safe lint and dead-code fixes under approval rules.",
  ];

  return {
    repo: normalizedRepo,
    mode,
    score: Math.round(score),
    status,
    summary:
      status === "healthy"
        ? "Repository health is strong. The next best move is to tighten coverage on the most business-critical modules."
        : status === "watch"
          ? "Repository health is acceptable but trending toward higher maintenance risk. Dependency and test improvements are recommended."
          : "Repository health is at risk. Immediate follow-up is recommended for dependency hygiene and test coverage.",
    checks,
    findings,
    actions,
  };
}
