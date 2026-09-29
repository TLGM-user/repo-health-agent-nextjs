import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/retention";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getNotificationSettings(userId);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Notification settings error:", error);
    return NextResponse.json({ error: "Failed to get notification settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await req.json();
    const updated = await updateNotificationSettings(userId, settings);
    return NextResponse.json({ settings: updated });
  } catch (error) {
    console.error("Notification settings update error:", error);
    return NextResponse.json({ error: "Failed to update notification settings" }, { status: 500 });
  }
}
