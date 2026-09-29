"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

type ScoredItem = {
  finding: { title: string; severity: string; description: string };
  source: string;
  confidence: string;
  tier: string;
  path?: string;
};

type Preview = {
  runId: string;
  repo: string;
  branch: string;
  title: string;
  body: string;
  changelog: string;
  files: string[];
  eligible: ScoredItem[];
  deferred: ScoredItem[];
  requiresApproval: true;
};

type ApplyResult = {
  branch: string;
  deleted: string[];
  dropped: number;
  prNumber: number;
  prUrl: string;
  error?: string;
  hint?: string;
};

export default function FixesPage() {
  const { darkMode, toggleTheme } = useTheme();
  const [repo, setRepo] = useState("github.com/acme/platform-service");
  const [installationId, setInstallationId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<(Preview & { score: number; status: string }) | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState<"idle" | "preview" | "apply">("idle");
  const [error, setError] = useState("");

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("preview");
    setError("");
    setPreview(null);
    setApplyResult(null);
    setConfirmed(false);
    try {
      const response = await fetch("/api/fixes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo,
          installationId: installationId ? Number(installationId) : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string; preview?: Preview; score?: number; status?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? "Preview failed.");
      setPreview({ ...payload.preview, score: payload.score ?? 0, status: payload.status ?? "unknown" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleApply() {
    if (!preview || !confirmed) return;
    setBusy("apply");
    setError("");
    try {
      const response = await fetch("/api/fixes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview, installationId: Number(installationId) }),
      });
      const payload = (await response.json()) as ApplyResult;
      if (!response.ok) throw new Error(payload.hint ? `${payload.error} ${payload.hint}` : (payload.error ?? "Apply failed."));
      setApplyResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar navItems={[{ label: "Home", href: "/" }]} darkMode={darkMode} onToggleTheme={toggleTheme} />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">Fix approval</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Review &amp; approve automated cleanup</h1>
        <p className="mt-3 text-slate-300">
          Step 1 generates a signed dry-run preview. Step 2 deletes files and opens a PR — only after you
          confirm the file list. Writes require a GitHub App installation (least-privilege token).
        </p>

        <form onSubmit={handlePreview} className="mt-8 grid gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 md:grid-cols-[1fr_200px_auto]">
          <input
            aria-label="Repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="github.com/org/repo"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
          />
          <input
            aria-label="Installation ID"
            value={installationId}
            onChange={(e) => setInstallationId(e.target.value)}
            placeholder="Installation ID"
            inputMode="numeric"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={busy !== "idle"}
            className="rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {busy === "preview" ? "Scanning…" : "1. Generate preview"}
          </button>
        </form>

        {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}

        {preview && (
          <div className="mt-8 space-y-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">{preview.repo}</h2>
              <span className="text-sm text-slate-300">Score {preview.score} · {preview.status}</span>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-white">Files to delete ({preview.files.length})</h3>
              {preview.files.length === 0 ? (
                <p className="text-sm text-slate-400">No P0 autofix-safe targets — nothing would be deleted.</p>
              ) : (
                <ul className="space-y-1 text-sm text-slate-200">
                  {preview.files.map((f) => (
                    <li key={f} className="rounded-lg bg-slate-950 px-3 py-1.5 font-mono text-xs">{f}</li>
                  ))}
                </ul>
              )}
            </div>

            {preview.deferred.length > 0 && (
              <details className="text-sm text-slate-300">
                <summary className="cursor-pointer text-slate-400">Deferred to human review ({preview.deferred.length})</summary>
                <ul className="mt-2 space-y-1">
                  {preview.deferred.map((d) => (
                    <li key={d.finding.title}>[{d.tier}] {d.finding.title}</li>
                  ))}
                </ul>
              </details>
            )}

            <details className="text-sm text-slate-300">
              <summary className="cursor-pointer text-slate-400">Proposed PR: {preview.title}</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs">{preview.body}</pre>
            </details>

            <label className="flex items-start gap-3 text-sm text-slate-200">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
              I reviewed the file list above and approve deleting these {preview.files.length} file(s) on branch {preview.branch}.
            </label>

            <button
              onClick={handleApply}
              disabled={!confirmed || busy !== "idle" || preview.files.length === 0 || !installationId}
              className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "apply" ? "Opening PR…" : "2. Approve & open PR"}
            </button>
            {!installationId && <p className="text-xs text-slate-400">Enter an Installation ID to enable apply (writes never use a fallback token).</p>}
          </div>
        )}

        {applyResult && (
          <div className="mt-8 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <h2 className="text-xl font-bold text-white">PR opened #{applyResult.prNumber}</h2>
            <a href={applyResult.prUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-emerald-300 underline">
              {applyResult.prUrl}
            </a>
            <p className="mt-3 text-sm text-slate-200">Deleted: {applyResult.deleted.join(", ") || "—"}</p>
            {applyResult.dropped > 0 && <p className="text-xs text-slate-400">{applyResult.dropped} submitted path(s) dropped as ineligible.</p>}
            <p className="mt-2 text-xs text-slate-400">PR opens as a draft — unmergeable until CI is green and a human marks it ready. Rollback: revert the PR.</p>
          </div>
        )}

        <p className="mt-8 text-sm text-slate-500">
          <Link href="/" className="underline">Back home</Link>
        </p>
      </main>
    </div>
  );
}
