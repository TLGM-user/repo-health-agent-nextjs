import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createTeam, listTeams, addTeamMember, listTeamMembers } from "@/lib/retention";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teams = await listTeams(userId);
    return NextResponse.json({ teams });
  } catch (error) {
    console.error("Teams list error:", error);
    return NextResponse.json({ error: "Failed to list teams" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, installationId, memberId, memberRole } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const team = await createTeam(userId, name, installationId);

    if (memberId) {
      await addTeamMember(team.id, memberId, memberRole ?? "member");
    }

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error("Team create error:", error);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
