import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAlert, listAlerts, acknowledgeAlert } from "@/lib/retention";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const acknowledged = searchParams.get("acknowledged");
    const alerts = await listAlerts(
      userId,
      acknowledged !== null ? acknowledged === "true" : undefined
    );
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Alerts list error:", error);
    return NextResponse.json({ error: "Failed to list alerts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repo, type, severity, message } = await req.json();

    if (!repo || !type || !severity || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const alert = await createAlert(userId, repo, type, severity, message);
    return NextResponse.json({ alert }, { status: 201 });
  } catch (error) {
    console.error("Alert create error:", error);
    return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json();
    const alert = await acknowledgeAlert(id);
    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Alert acknowledge error:", error);
    return NextResponse.json({ error: "Failed to acknowledge alert" }, { status: 500 });
  }
}
