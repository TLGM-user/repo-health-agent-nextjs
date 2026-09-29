import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getReportData } from "@/lib/retention";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const installationId = searchParams.get("installationId");

    if (!installationId) {
      return NextResponse.json({ error: "Installation ID is required" }, { status: 400 });
    }

    const report = await getReportData(parseInt(installationId));

    if (!report) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="gitflow-report-${installationId}.json"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export report" }, { status: 500 });
  }
}
