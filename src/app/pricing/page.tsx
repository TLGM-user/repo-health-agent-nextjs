"use client";

import { useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/lib/use-theme";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For individual developers getting started",
    features: [
      "1 repository",
      "On-demand scans",
      "Basic health score",
      "7-day history",
    ],
    cta: "Get started",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For teams that need continuous monitoring",
    features: [
      "Unlimited repositories",
      "Scheduled scans",
      "Advanced analytics",
      "90-day history",
      "Slack notifications",
      "Priority support",
    ],
    cta: "Start free trial",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations with advanced needs",
    features: [
      "Everything in Pro",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantee",
      "SSO/SAML",
      "Custom contracts",
    ],
    cta: "Contact sales",
    popular: false,
  },
];

export default function PricingPage() {
  const { darkMode, toggleTheme } = useTheme();
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCheckout(planId: string) {
    if (planId === "enterprise") {
      router.push("/contact");
      return;
    }

    if (!user) {
      router.push("/sign-up");
      return;
    }

    setLoading(planId);
    try {
      const token = await getToken();
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        navItems={[
          { label: "Features", href: "/#features" },
          { label: "Pricing", href: "/pricing" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Contact", href: "/#contact" },
        ]}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-bold text-white sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Start free, upgrade when you need more
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl border p-8 ${
                plan.popular
                  ? "border-indigo-500 bg-indigo-500/5 shadow-2xl shadow-indigo-500/20"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              {plan.popular && (
                <span className="mb-4 inline-block rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-slate-400">{plan.period}</span>
              </div>
              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-slate-300">
                    <span className="text-emerald-400">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loading === plan.id}
                className={`mt-8 w-full rounded-full px-5 py-3 text-sm font-medium transition ${
                  plan.popular
                    ? "bg-indigo-500 text-white hover:bg-indigo-400"
                    : "border border-slate-700 text-slate-100 hover:bg-slate-800"
                } disabled:opacity-50`}
              >
                {loading === plan.id ? "Loading..." : plan.cta}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
