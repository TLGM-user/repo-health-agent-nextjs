"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

type NotificationSettings = {
  slackWebhookUrl: string | null;
  emailEnabled: boolean;
  alertOnCritical: boolean;
  alertOnWatch: boolean;
  weeklyDigest: boolean;
};

export default function SettingsPage() {
  const { darkMode, toggleTheme } = useTheme();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage("Settings saved successfully");
      } else {
        setMessage("Failed to save settings");
      }
    } catch (err) {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
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

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-2xl font-bold text-white">Settings</h1>

        {message && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${
            message.includes("successfully")
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}>
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-300">
            Loading settings...
          </div>
        ) : settings ? (
          <div className="space-y-6">
            {/* Notifications */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold text-white">Notifications</h2>
              <p className="mt-1 text-sm text-slate-400">
                Configure how GitFlow alerts you about repo health changes
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">
                    Slack Webhook URL
                  </label>
                  <input
                    type="url"
                    value={settings.slackWebhookUrl ?? ""}
                    onChange={(e) =>
                      setSettings({ ...settings, slackWebhookUrl: e.target.value || null })
                    }
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, emailEnabled: e.target.checked })
                    }
                    className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Email notifications</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.alertOnCritical}
                    onChange={(e) =>
                      setSettings({ ...settings, alertOnCritical: e.target.checked })
                    }
                    className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Alert on critical issues</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.alertOnWatch}
                    onChange={(e) =>
                      setSettings({ ...settings, alertOnWatch: e.target.checked })
                    }
                    className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Alert on warning issues</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.weeklyDigest}
                    onChange={(e) =>
                      setSettings({ ...settings, weeklyDigest: e.target.checked })
                    }
                    className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Weekly digest email</span>
                </label>
              </div>
            </section>

            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900 p-12 text-center text-slate-300">
            No settings found.
          </div>
        )}
      </main>
    </div>
  );
}
