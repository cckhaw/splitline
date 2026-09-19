import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getRaceGoal, getRaceCourse, saveRaceCourse, deleteRaceCourse, friendlyDbErrorMessage } from "@/lib/db";
import { parseGpxCourse } from "@/lib/gpxCourse";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_GPX_LENGTH = 8_000_000; // ~8MB of XML text — generous even for a long ultra course

// Maps both a freshly-parsed course profile and a `race_courses` DB row
// (snake_case) to the same client-facing shape. `segments` is
// deliberately left out of what the client gets back — it's only ever
// consumed server-side, feeding the race-day AI call.
function toClientCourse(c) {
  return {
    filename: c.filename || null,
    totalDistanceKm: c.totalDistanceKm ?? c.total_distance_km,
    totalElevationGainM: c.totalElevationGainM ?? c.total_elevation_gain_m,
    totalElevationLossM: c.totalElevationLossM ?? c.total_elevation_loss_m,
    minElevationM: c.minElevationM ?? c.min_elevation_m,
    maxElevationM: c.maxElevationM ?? c.max_elevation_m,
    hasElevationData: c.hasElevationData ?? c.max_elevation_m != null,
    startLat: c.startLat ?? c.start_lat,
    startLon: c.startLon ?? c.start_lon,
    profile: c.profile,
    uploadedAt: c.uploaded_at || new Date().toISOString(),
  };
}

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const course = await getRaceCourse(session.userId);
    return NextResponse.json({ course: course ? toClientCourse(course) : null });
  } catch (e) {
    console.error("Failed to load race course:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}

// Body: { filename, gpxXml } — the client reads the uploaded File as
// text (File.text()) rather than this route accepting multipart, since
// a GPX file is just XML text and this keeps the request a plain JSON
// POST like every other route in this app.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { filename, gpxXml } = await request.json().catch(() => ({}));
  if (typeof gpxXml !== "string" || !gpxXml.trim()) {
    return NextResponse.json({ error: "invalid_file", message: "That doesn't look like a GPX file." }, { status: 400 });
  }
  if (gpxXml.length > MAX_GPX_LENGTH) {
    return NextResponse.json({ error: "file_too_large", message: "That GPX file is too large — try a simplified export." }, { status: 400 });
  }

  try {
    const goal = await getRaceGoal(session.userId);
    if (!goal) return NextResponse.json({ error: "no_goal", message: "Set an upcoming event on the Training plan page first." }, { status: 400 });
  } catch (e) {
    console.error("Failed to load race goal for course upload:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }

  let profile;
  try {
    profile = parseGpxCourse(gpxXml);
  } catch (e) {
    return NextResponse.json({ error: "invalid_gpx", message: e.message || "Couldn't read that GPX file." }, { status: 400 });
  }

  const cleanFilename = typeof filename === "string" ? filename.slice(0, 200) : null;
  try {
    await saveRaceCourse(session.userId, { filename: cleanFilename, ...profile });
    trackEvent(request, session.userId, "race_day_course_upload", { distanceKm: profile.totalDistanceKm });
    return NextResponse.json({ course: toClientCourse({ ...profile, filename: cleanFilename }) });
  } catch (e) {
    console.error("Failed to save race course:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    await deleteRaceCourse(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to remove race course:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
