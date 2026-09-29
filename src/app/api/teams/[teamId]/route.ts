import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { addTeamMember, listTeamMembers } from "@/lib/retention";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;
    const members = await listTeamMembers(parseInt(teamId));
    return NextResponse.json({ members });
  } catch (error) {
    console.error("Team members error:", error);
    return NextResponse.json({ error: "Failed to list team members" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;
    const { memberId, role } = await req.json();

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    const member = await addTeamMember(parseInt(teamId), memberId, role ?? "member");
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Team member add error:", error);
    return NextResponse.json({ error: "Failed to add team member" }, { status: 500 });
  }
}
