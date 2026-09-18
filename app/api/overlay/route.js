import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivityById } from "@/lib/db";
import { buildSvg } from "@/lib/svg";
import { svgToPng } from "@/lib/renderPng";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { activity_id, theme = "ink", units = "metric", hero_metric, trace_metric = "elevation", format = "png", intent = "save" } = await request.json();

  const a = await getActivityById(session.userId, activity_id);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const traceKey = trace_metric === "heart_rate" ? "heart_rate" : trace_metric === "power" ? "power" : "elevation";
  const trace = a.trace?.[traceKey] || a.trace?.elevation || null;

  const svg = buildSvg({
    name: a.name,
    sport: a.sport,
    date: a.startDate,
    distance_km: a.distanceKm,
    moving_min: a.movingMin,
    elevation_gain_m: a.elevationGainM,
    avg_hr: a.avgHr,
    avg_watts: a.avgWatts,
    avg_speed_kmh: a.avgSpeedKmh,
    calories: a.calories,
    trace,
    trace_label: trace_metric === "heart_rate" ? "Heart rate" : trace_metric === "power" ? "Power" : "Elevation",
    hero_metric,
    units,
    theme,
  });

  if (format === "svg") {
    return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
  }
  // Only real png downloads count as an export — the gallery's own
  // svg-preview renders (format=svg, above) aren't a user-initiated save.
  trackEvent(request, session.userId, "export_share", {
    source: intent === "post_strava" ? "post_strava" : "save_image",
    panel: "activity_overlay",
  });
  const png = await svgToPng(svg);
  return new NextResponse(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}
