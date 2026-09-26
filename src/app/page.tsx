"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { FeatureCard, type FeatureCardProps } from "@/components/FeatureCard";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

type ScanFormState = {
  repo: string;
  mode: "scheduled" | "on-demand" | "cli";
};

type HealthMetric = {
  label: string;
  value: string;
  trend: string;
};

type HealthFinding = {
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  description: string;
};

type RepoHealthResponse = {
  repo: string;
  mode: "scheduled" | "on-demand" | "cli";
  score: number;
  status: "healthy" | "watch" | "critical";
  summary: string;
  checks: HealthMetric[];
  findings: HealthFinding[];
  actions: string[];
};

type InstallationRepoSummary = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch?: string | null;
  html_url?: string | null;
  selected?: boolean;
  latestAnalysis?: {
    repo: string;
    mode: string;
    status: "healthy" | "watch" | "critical";
    score: number;
    summary: string;
    "createdAt": string;
  } | null;
};

type InstallationSummary = {
  id: number;
  "installationId": number;
  owner: string;
  repo?: string | null;
  "accountType": "User" | "Organization";
  status: "active" | "disabled" | "pending";
  repositories: InstallationRepoSummary[];
};

const navItems = [
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Dashboard", href: "#dashboard" },
  { label: "Contact", href: "#contact" },
];

const features: FeatureCardProps[] = [
  {
    title: "Security scan",
    description: "Catch dependency vulnerabilities, bad secrets patterns, and risky repo changes before they reach production.",
    icon: "🛡️",
  },
  {
    title: "Dependency automation",
    description: "Open safe upgrade PRs, group updates, and validate them with CI before they hit the default branch.",
    icon: "📦",
  },
  {
    title: "Missing tests",
    description: "Find risky or untested code paths and suggest targeted tests with confidence scoring and clear rationale.",
    icon: "🧪",
  },
];

const initialScanForm: ScanFormState = {
  repo: "github.com/acme/platform-service",
  mode: "on-demand",
};

export default function Home() {
  const { darkMode, toggleTheme } = useTheme();
  const [scanForm, setScanForm] = useState<ScanFormState>(initialScanForm);
  const [result, setResult] = useState<RepoHealthResponse | null>(null);
  const [installations, setInstallations] = useState<InstallationSummary[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    async function loadInstallations() {
      try {
        const response = await fetch("/api/admin/installations");
        const payload = (await response.json()) as {
          installations?: InstallationSummary[];
          repositoryCount?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load installation data.");
        }

        setInstallations(payload.installations ?? []);
      } catch (dashboardError) {
        console.error(dashboardError);
      } finally {
        setDashboardLoading(false);
      }
    }

    void loadInstallations();
  }, []);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = event.target;

    setScanForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsScanning(true);
    setError("");

    try {
      const activeInstallation =
        installations.find((installation) => installation.status === "active") ??
        installations[0];

      const response = await fetch("/api/repo-health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...scanForm,
          installationId: activeInstallation?.installationId,
        }),
      });

      const payload = (await response.json()) as RepoHealthResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "The repository scan could not be completed.");
      }

      setResult(payload);
    } catch (scanError) {
      setError(
        scanError instanceof Error ? scanError.message : "The repository scan could not be completed."
      );
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        navItems={navItems}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
              Repo Health Agent
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Continuously protect your repo from drift, risk, and technical debt.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Scan GitHub repositories for security issues, dependency drift, dead-code hotspots, and missing test coverage. Then turn findings into safe, reviewable PRs.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#dashboard"
                className="rounded-full bg-indigo-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
              >
                View dashboard
              </a>
              <a
                href="#features"
                className="rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
              >
                Explore platform
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm text-slate-300">
              <div>
                <span className="block text-2xl font-bold text-white">4.8x</span>
                Faster issue detection
              </div>
              <div>
                <span className="block text-2xl font-bold text-white">92%</span>
                Safe auto-fix confidence
              </div>
              <div>
                <span className="block text-2xl font-bold text-white">24/7</span>
                CI-ready monitoring
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-indigo-950/30">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Repository health</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Live scan</h2>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                Ready
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="repo" className="mb-1 block text-sm text-slate-300">
                  Repository
                </label>
                <input
                  id="repo"
                  name="repo"
                  type="text"
                  value={scanForm.repo}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="github.com/org/repo"
                />
              </div>

              <div>
                <label htmlFor="mode" className="mb-1 block text-sm text-slate-300">
                  Trigger mode
                </label>
                <select
                  id="mode"
                  name="mode"
                  value={scanForm.mode}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="scheduled">Scheduled runner</option>
                  <option value="on-demand">On-demand</option>
                  <option value="cli">CLI</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isScanning}
                className="w-full rounded-full bg-indigo-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isScanning ? "Scanning..." : "Run health check"}
              </button>
            </form>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
              Platform features
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white">Everything needed to keep a repo healthy.</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section id="workflow" className="bg-slate-900 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-10 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
                Workflow
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white">A safe automation loop from scan to merge.</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-4">
              {[
                "Connect repo",
                "Run analyzer",
                "Create reviewable PR",
                "Merge with policy checks",
              ].map((step, index) => (
                <div key={step} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-300">
                    0{index + 1}
                  </div>
                  <p className="text-lg font-semibold text-white">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="dashboard" className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
              Installed repos + latest scan results
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white">Platform dashboard</h2>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Installations</p>
              <p className="mt-3 text-3xl font-bold text-white">{installations.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Repos tracked</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {installations.reduce((total, installation) => total + installation.repositories.length, 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">At risk</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {installations.reduce(
                  (total, installation) =>
                    total +
                    installation.repositories.filter(
                      (repo) => repo.latestAnalysis?.status === "critical" || repo.latestAnalysis?.status === "watch"
                    ).length,
                  0
                )}
              </p>
            </div>
          </div>

          {dashboardLoading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-300">
              Loading installed repos and scan summaries...
            </div>
          ) : installations.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center text-slate-300">
              No GitHub installations have been registered yet.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {installations.map((installation) => (
                <div key={installation["installationId"]} className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/30">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">Installation</p>
                      <h3 className="mt-2 text-xl font-bold text-white">{installation.owner}</h3>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200">
                      {installation.status}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {installation.repositories.length === 0 ? (
                      <p className="text-sm text-slate-400">No repositories registered for this installation.</p>
                    ) : (
                      installation.repositories.map((repo) => (
                        <div key={repo.full_name} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <a
                                href={repo.html_url ?? `https://github.com/${repo.full_name}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-base font-semibold text-white hover:text-indigo-300"
                              >
                                {repo.full_name}
                              </a>
                              <p className="mt-1 text-xs text-slate-400">
                                {repo.default_branch ? `Default branch: ${repo.default_branch}` : "Repo registered"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                repo.latestAnalysis?.status === "healthy"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : repo.latestAnalysis?.status === "watch"
                                    ? "bg-yellow-500/15 text-yellow-300"
                                    : repo.latestAnalysis?.status === "critical"
                                      ? "bg-red-500/15 text-red-300"
                                      : "bg-slate-700 text-slate-200"
                              }`}
                            >
                              {repo.latestAnalysis?.status ?? "No scan yet"}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs text-slate-400">Latest score</p>
                              <p className="text-xl font-bold text-white">{repo.latestAnalysis?.score ?? "—"}</p>
                            </div>
                            <div className="flex-1">
                              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500"
                                  style={{
                                    width: `${repo.latestAnalysis?.score ?? 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-slate-300">
                            {repo.latestAnalysis?.summary ?? "No scan has been executed for this repository yet."}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result ? (
            <div className="mt-8 space-y-8 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm text-slate-400">Repository</p>
                  <h3 className="text-2xl font-bold text-white">{result.repo}</h3>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                    {result.mode}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      result.status === "healthy"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : result.status === "watch"
                          ? "bg-yellow-500/15 text-yellow-300"
                          : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-slate-400">Overall score</p>
                  <p className="text-3xl font-bold text-white">{result.score}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500"
                    style={{ width: `${result.score}%` }}
                  />
                </div>
                <p className="mt-4 text-sm text-slate-300">{result.summary}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {result.checks.map((check) => (
                  <div key={check.label} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">{check.label}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{check.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{check.trend}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">Priority findings</h4>
                  <div className="space-y-4">
                    {result.findings.map((finding) => (
                      <div key={finding.title} className="rounded-xl border border-slate-800 p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="font-medium text-white">{finding.title}</p>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                              finding.severity === "Critical"
                                ? "bg-red-600/20 text-red-200"
                                : finding.severity === "High"
                                  ? "bg-red-500/10 text-red-300"
                                  : finding.severity === "Medium"
                                    ? "bg-yellow-500/10 text-yellow-300"
                                    : "bg-emerald-500/10 text-emerald-300"
                            }`}
                          >
                            {finding.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">{finding.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">Recommended actions</h4>
                  <ul className="space-y-3 text-sm text-slate-300">
                    {result.actions.map((action) => (
                      <li key={action} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 rounded-full bg-indigo-400" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center text-slate-300">
              Enter a repository to generate a baseline health report.
            </div>
          )}
        </section>

        <section id="contact" className="mx-auto max-w-6xl px-6 pb-20 pt-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">Contact</p>
            <h3 className="mt-3 text-3xl font-bold text-white">Want a repo health agent for your engineering org?</h3>
            <div className="mt-6 flex flex-wrap gap-4">
              <a href="mailto:hello@repohealthagent.dev" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-200">
                hello@repohealthagent.dev
              </a>
              <a href="#dashboard" className="rounded-full border border-slate-700 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800">
                Try a scan
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
