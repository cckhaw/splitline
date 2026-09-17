import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser } from "@/lib/db";
import { computeTrainingLoad, predictRacePaces } from "@/lib/insights";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const activities = await getActivitiesForUser(session.userId, 30);
  return NextResponse.json({
    load: computeTrainingLoad(activities),
    pace: predictRacePaces(activities),
    sampleSize: activities.length,
  });
}
