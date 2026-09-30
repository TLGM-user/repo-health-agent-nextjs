import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { getBillingInfo } from "@/lib/billing";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billing = await getBillingInfo(userId);

    return NextResponse.json({
      plan: billing.plan,
      status: billing.status,
      currentPeriodEnd: billing.currentPeriodEnd,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error("Billing info error:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing info" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = (await req.json()) as { action: "cancel" | "resume" };

    const billing = await getBillingInfo(userId);

    if (!billing.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription" },
        { status: 400 }
      );
    }

    if (action === "cancel") {
      await getStripe().subscriptions.update(billing.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } else if (action === "resume") {
      await getStripe().subscriptions.update(billing.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Billing action error:", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
