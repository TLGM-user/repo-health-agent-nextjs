import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe, PLANS } from "@/lib/stripe";
import { upsertBillingCustomer } from "@/lib/billing";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan } = (await req.json()) as { plan: "pro" | "enterprise" };

    if (!plan || !PLANS[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = PLANS[plan].priceId;

    if (!priceId) {
      return NextResponse.json(
        { error: "This plan requires contacting sales" },
        { status: 400 }
      );
    }

    // Check if customer already exists
    const { getBillingInfo } = await import("@/lib/billing");
    const billing = await getBillingInfo(userId);

    let customerId = billing.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
      });
      customerId = customer.id;
      await upsertBillingCustomer({ userId, stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pricing?checkout=canceled`,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
