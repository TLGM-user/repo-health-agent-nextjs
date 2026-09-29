"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

type OnboardingStep = "connect" | "select" | "scan" | "done";

type Repo = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string | null;
  html_url: string | null;
};

type Installation = {
  installationId: number;
  owner: string;
  status: string;
  repositories: Repo[];
};

export default function OnboardingPage() {
  const { darkMode, toggleTheme } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("connect");
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  async function handleConnectGitHub() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/github/install");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load installations");
      setInstallations(data.installations ?? []);
      setStep("select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }

  function toggleRepo(fullName: string) {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return next;
    });
  }

  async function handleStartScan() {
    if (selectedRepos.size === 0) {
      setError("Select at least one repository");
      return;
    }

    setScanning(true);
    setError("");

    try {
      const installation = installations[0];
      const repoList = Array.from(selectedRepos);

      for (const repo of repoList) {
        const res = await fetch(
          `/api/admin/installations/${installation.installationId}/analyze?repo=${encodeURIComponent(repo)}`,
          { method: "POST" }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to queue scan for ${repo}`);
        }
      }

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
    } finally {
      setScanning(false);
    }
  }

  const steps = [
    { id: "connect", label: "Connect GitHub" },
    { id: "select", label: "Select repos" },
    { id: "scan", label: "Initial scan" },
    { id: "done", label: "Done" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        navItems={[
          { label: "Features", href: "/#features" },
          { label: "Pricing", href: "/pricing" },
          { label: "Dashboard", href: "/dashboard" },
        ]}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold text-white">Welcome to GitFlow Analytics</h1>
          <p className="mt-2 text-slate-400">
            Let&apos;s get your first repo scan set up in under 2 minutes
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12 flex items-center justify-center gap-4">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  i <= currentStepIndex
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-sm ${
                  i <= currentStepIndex ? "text-white" : "text-slate-500"
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className="h-px w-8 bg-slate-700" />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {step === "connect" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-3xl">
                🐙
              </div>
              <h2 className="text-xl font-bold text-white">Connect your GitHub account</h2>
              <p className="mt-2 text-slate-400">
                Install the GitFlow Analytics GitHub App to get started. We&apos;ll scan your repos for security, dependencies, tests, and maintenance health.
              </p>
              <button
                onClick={handleConnectGitHub}
                disabled={loading}
                className="mt-8 rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Install GitHub App"}
              </button>
            </div>
          )}

          {step === "select" && (
            <div>
              <h2 className="text-xl font-bold text-white">Select repositories to monitor</h2>
              <p className="mt-2 text-slate-400">
                Choose which repos GitFlow should scan. You can change this later.
              </p>

              <div className="mt-6 space-y-3">
                {installations.length === 0 ? (
                  <p className="text-sm text-slate-400">No installations found. Please install the GitHub App first.</p>
                ) : (
                  installations.map((inst) =>
                    inst.repositories.map((repo) => (
                      <label
                        key={repo.full_name}
                        className="flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 transition hover:border-slate-600"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRepos.has(repo.full_name)}
                          onChange={() => toggleRepo(repo.full_name)}
                          className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-white">{repo.full_name}</p>
                          <p className="text-xs text-slate-400">
                            {repo.private ? "Private" : "Public"} • {repo.default_branch ?? "main"}
                          </p>
                        </div>
                      </label>
                    ))
                  )
                )}
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep("connect")}
                  className="rounded-full border border-slate-700 px-5 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={handleStartScan}
                  disabled={scanning || selectedRepos.size === 0}
                  className="rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                >
                  {scanning ? "Starting scan..." : `Start scan (${selectedRepos.size} repos)`}
                </button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-3xl">
                ✅
              </div>
              <h2 className="text-xl font-bold text-white">You&apos;re all set!</h2>
              <p className="mt-2 text-slate-400">
                Your initial scan is running in the background. Results will appear in your dashboard in a few minutes.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-8 rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
              >
                Go to dashboard
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
