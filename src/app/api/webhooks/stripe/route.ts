import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { recordBillingEvent, upsertBillingCustomer } from "@/lib/billing";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: skip if already processed
  await recordBillingEvent({
    stripeEventId: event.id,
    stripeCustomerId: typeof event.data.object === "object" && event.data.object && "customer" in event.data.object
      ? String((event.data.object as { customer: string }).customer)
      : undefined,
    stripeSubscriptionId: typeof event.data.object === "object" && event.data.object && "subscription" in event.data.object
      ? String((event.data.object as { subscription: string }).subscription)
      : undefined,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as {
          customer: string;
          subscription: string;
          metadata: { userId?: string; plan?: string };
        };
        if (session.metadata.userId) {
          await upsertBillingCustomer({
            userId: session.metadata.userId,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            plan: (session.metadata.plan as "pro" | "enterprise") ?? "pro",
            status: "active",
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as unknown as {
          customer: string;
          id: string;
          status: string;
          current_period_end: number;
          cancel_at_period_end: boolean;
          metadata: { userId?: string; plan?: string };
        };
        if (subscription.metadata.userId) {
          await upsertBillingCustomer({
            userId: subscription.metadata.userId,
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            plan: (subscription.metadata.plan as "pro" | "enterprise") ?? "pro",
            status: subscription.status as "active" | "canceled" | "past_due" | "trialing",
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as unknown as {
          customer: string;
          id: string;
          metadata: { userId?: string };
        };
        if (subscription.metadata.userId) {
          await upsertBillingCustomer({
            userId: subscription.metadata.userId,
            stripeCustomerId: subscription.customer,
            plan: "free",
            status: "none",
            cancelAtPeriodEnd: false,
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error("Webhook handling error:", error);
    // Still return 200 so Stripe doesn't retry unhandled events
  }

  return NextResponse.json({ received: true });
}
