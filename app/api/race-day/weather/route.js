import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getRaceGoal, getRaceCourse, friendlyDbErrorMessage } from "@/lib/db";
import { getRaceDayWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const maxDuration = 30;

// Read-only lookup the Race Day Plan page calls to prefill the
// temperature/humidity fields — it doesn't persist anything itself,
// since whatever the athlete ends up submitting (auto-filled or
// hand-edited) is what /api/race-day saves alongside the generated plan.
// Requires a course to already be uploaded (that's where the location —
// the course's start coordinates — comes from; there's no separate
// geocoding step).
export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  let goal, course;
  try {
    [goal, course] = await Promise.all([getRaceGoal(session.userId), getRaceCourse(session.userId)]);
  } catch (e) {
    console.error("Failed to load data for race-day weather lookup:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
  if (!goal) return NextResponse.json({ error: "no_goal", message: "Set an upcoming event first." }, { status: 400 });
  if (!course) return NextResponse.json({ weather: { source: "unavailable", reason: "no_location" } });

  const weather = await getRaceDayWeather({
    lat: course.start_lat,
    lon: course.start_lon,
    eventDateIso: new Date(goal.eventDate).toISOString().slice(0, 10),
  });
  return NextResponse.json({ weather });
}
