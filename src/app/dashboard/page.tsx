"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

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

type BillingInfo = {
  plan: "free" | "pro" | "enterprise";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export default function DashboardPage() {
  const { darkMode, toggleTheme } = useTheme();
  const { user } = useUser();
  const [installations, setInstallations] = useState<InstallationSummary[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [installationsRes, billingRes] = await Promise.all([
          fetch("/api/admin/installations"),
          fetch("/api/billing"),
        ]);

        if (installationsRes.ok) {
          const data = await installationsRes.json();
          setInstallations(data.installations ?? []);
        }

        if (billingRes.ok) {
          const data = await billingRes.json();
          setBilling(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const totalRepos = installations.reduce(
    (total, inst) => total + inst.repositories.length,
    0
  );
  const atRisk = installations.reduce(
    (total, inst) =>
      total +
      inst.repositories.filter(
        (repo) =>
          repo.latestAnalysis?.status === "critical" ||
          repo.latestAnalysis?.status === "watch"
      ).length,
    0
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        navItems={[
          { label: "Features", href: "/#features" },
          { label: "Pricing", href: "/pricing" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Onboarding", href: "/onboarding" },
        ]}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-slate-400">
              Welcome back{user ? `, ${user.firstName ?? user.emailAddresses[0]?.emailAddress}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {billing && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  billing.plan === "pro"
                    ? "bg-indigo-500/15 text-indigo-300"
                    : billing.plan === "enterprise"
                      ? "bg-purple-500/15 text-purple-300"
                      : "bg-slate-700 text-slate-300"
                }`}
              >
                {billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)} plan
              </span>
            )}
            <Link
              href="/onboarding"
              className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Add repo
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Installations</p>
            <p className="mt-2 text-3xl font-bold text-white">{installations.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Repos tracked</p>
            <p className="mt-2 text-3xl font-bold text-white">{totalRepos}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">At risk</p>
            <p className="mt-2 text-3xl font-bold text-white">{atRisk}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-300">
            Loading dashboard...
          </div>
        ) : installations.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center">
            <p className="text-slate-300">No GitHub installations yet.</p>
            <Link
              href="/onboarding"
              className="mt-4 inline-block rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Connect your first repo
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {installations.map((installation) => (
              <div
                key={installation["installationId"]}
                className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/30"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">
                      Installation
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-white">
                      {installation.owner}
                    </h3>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200">
                    {installation.status}
                  </span>
                </div>

                <div className="space-y-3">
                  {installation.repositories.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No repositories registered.
                    </p>
                  ) : (
                    installation.repositories.map((repo) => (
                      <div
                        key={repo.full_name}
                        className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
                      >
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
                              {repo.default_branch
                                ? `Default branch: ${repo.default_branch}`
                                : "Repo registered"}
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
                            <p className="text-xl font-bold text-white">
                              {repo.latestAnalysis?.score ?? "—"}
                            </p>
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
                          {repo.latestAnalysis?.summary ??
                            "No scan has been executed for this repository yet."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
