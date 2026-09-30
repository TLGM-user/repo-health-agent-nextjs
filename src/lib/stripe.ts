import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!, {
    typescript: true,
  });
  return stripeClient;
}

export const PLANS = {
  free: {
    name: "Free",
    priceId: null,
    price: 0,
    features: [
      "1 repository",
      "On-demand scans",
      "Basic health score",
      "7-day history",
    ],
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_ID_PRO ?? "price_placeholder_pro",
    price: 29,
    features: [
      "Unlimited repositories",
      "Scheduled scans",
      "Advanced analytics",
      "90-day history",
      "Slack notifications",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    priceId: null,
    price: null,
    features: [
      "Everything in Pro",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantee",
      "SSO/SAML",
      "Custom contracts",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlanLimits(plan: PlanId) {
  switch (plan) {
    case "pro":
      return { maxRepos: Infinity, maxHistoryDays: 90, scheduledScans: true };
    case "enterprise":
      return { maxRepos: Infinity, maxHistoryDays: 365, scheduledScans: true };
    default:
      return { maxRepos: 1, maxHistoryDays: 7, scheduledScans: false };
  }
}
