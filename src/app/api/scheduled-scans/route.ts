import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createScheduledScan, listScheduledScans, toggleScheduledScan } from "@/lib/retention";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const installationId = searchParams.get("installationId");
    const scans = await listScheduledScans(
      installationId ? parseInt(installationId) : undefined
    );
    return NextResponse.json({ scans });
  } catch (error) {
    console.error("Scheduled scans error:", error);
    return NextResponse.json({ error: "Failed to list scheduled scans" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { installationId, repo, cron } = await req.json();

    if (!installationId || !repo) {
      return NextResponse.json({ error: "Installation ID and repo are required" }, { status: 400 });
    }

    const scan = await createScheduledScan(installationId, repo, cron ?? "0 9 * * 1");
    return NextResponse.json({ scan }, { status: 201 });
  } catch (error) {
    console.error("Scheduled scan create error:", error);
    return NextResponse.json({ error: "Failed to create scheduled scan" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, enabled } = await req.json();
    const scan = await toggleScheduledScan(id, enabled);
    return NextResponse.json({ scan });
  } catch (error) {
    console.error("Scheduled scan toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle scheduled scan" }, { status: 500 });
  }
}
