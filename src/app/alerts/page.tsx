"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

type Alert = {
  id: number;
  repo: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  acknowledged: boolean;
  createdAt: string;
};

export default function AlertsPage() {
  const { darkMode, toggleTheme } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unacknowledged" | "acknowledged">("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const query = filter === "all" ? "" : `?acknowledged=${filter === "acknowledged"}`;
        const res = await fetch(`/api/alerts${query}`);
        if (res.ok) {
          const data = await res.json();
          setAlerts(data.alerts ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [filter]);

  async function handleAcknowledge(id: number) {
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
      );
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        navItems={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Alerts", href: "/alerts" },
          { label: "Reports", href: "/reports" },
          { label: "Settings", href: "/settings" },
        ]}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Alerts</h1>
            <p className="text-sm text-slate-400">
              Health alerts and notifications for your repos
            </p>
          </div>
          <div className="flex gap-2">
            {(["all", "unacknowledged", "acknowledged"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  filter === f
                    ? "bg-indigo-500 text-white"
                    : "border border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-300">
            Loading alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center text-slate-300">
            No alerts found.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-2xl border p-4 ${
                  alert.acknowledged
                    ? "border-slate-800 bg-slate-900/50 opacity-60"
                    : alert.severity === "critical"
                      ? "border-red-500/30 bg-red-500/5"
                      : alert.severity === "warning"
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-slate-800 bg-slate-900"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          alert.severity === "critical"
                            ? "bg-red-500/20 text-red-300"
                            : alert.severity === "warning"
                              ? "bg-yellow-500/20 text-yellow-300"
                              : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-xs text-slate-400">{alert.type}</span>
                    </div>
                    <p className="mt-2 text-sm text-white">{alert.message}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {alert.repo} • {new Date(alert.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                    >
                      Acknowledge
                    </button>
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
