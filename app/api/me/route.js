import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, getStravaConnection, countActivitiesForUser } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ authenticated: false });

  const user = await getUserById(session.userId);
  const connection = await getStravaConnection(session.userId);
  const activityCount = await countActivitiesForUser(session.userId);

  return NextResponse.json({
    authenticated: true,
    email: user?.email,
    stravaConnected: Boolean(connection),
    usingOwnStravaApp: Boolean(connection?.ownClientId),
    activityCount,
  });
}
