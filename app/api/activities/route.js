import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const activities = await getActivitiesForUser(session.userId, 30);
  return NextResponse.json({
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
      sport: a.sport,
      startDate: a.startDate,
      distanceKm: a.distanceKm,
      hasHr: Boolean(a.avgHr),
      hasWatts: Boolean(a.avgWatts),
    })),
  });
}
