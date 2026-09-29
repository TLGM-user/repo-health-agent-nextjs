import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTrendHistory } from "@/lib/retention";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const repo = searchParams.get("repo");
    const days = parseInt(searchParams.get("days") ?? "30");

    if (!repo) {
      return NextResponse.json({ error: "Repo parameter is required" }, { status: 400 });
    }

    const trends = await getTrendHistory(repo, days);
    return NextResponse.json({ trends });
  } catch (error) {
    console.error("Trends error:", error);
    return NextResponse.json({ error: "Failed to get trends" }, { status: 500 });
  }
}
