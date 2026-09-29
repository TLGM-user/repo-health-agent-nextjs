"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

type Installation = {
  installationId: number;
  owner: string;
  status: string;
};

export default function ReportsPage() {
  const { darkMode, toggleTheme } = useTheme();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/github/install");
        if (res.ok) {
          const data = await res.json();
          setInstallations(data.installations ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleExport(installationId: number) {
    setDownloading(installationId);
    try {
      const res = await fetch(`/api/export?installationId=${installationId}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gitflow-report-${installationId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        navItems={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: "Settings", href: "/settings" },
          { label: "Pricing", href: "/pricing" },
        ]}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-white">Export Reports</h1>
        <p className="mb-8 text-sm text-slate-400">
          Download full analysis reports for your installations
        </p>

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-300">
            Loading installations...
          </div>
        ) : installations.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center text-slate-300">
            No installations found. Connect a GitHub App first.
          </div>
        ) : (
          <div className="space-y-4">
            {installations.map((inst) => (
              <div
                key={inst.installationId}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div>
                  <p className="font-semibold text-white">{inst.owner}</p>
                  <p className="text-xs text-slate-400">
                    Installation ID: {inst.installationId} • {inst.status}
                  </p>
                </div>
                <button
                  onClick={() => handleExport(inst.installationId)}
                  disabled={downloading === inst.installationId}
                  className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                >
                  {downloading === inst.installationId ? "Downloading..." : "Export JSON"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
