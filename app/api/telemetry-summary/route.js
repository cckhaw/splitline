import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, getSleepMetricsForActivities, friendlyDbErrorMessage } from "@/lib/db";
import { buildTelemetrySummary } from "@/lib/telemetrySummary";
import { buildTelemetrySummarySvg } from "@/lib/telemetrySummarySvg";
import { svgToPng } from "@/lib/renderPng";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { theme = "ink", units = "metric", format = "png", variant = "desktop" } = await request.json().catch(() => ({}));

  try {
    const activities = await getActivitiesForUser(session.userId, 30);
    if (!activities.length) {
      return NextResponse.json({ error: "no_data", message: "Import activities first." }, { status: 400 });
    }

    const sleepMetrics = await getSleepMetricsForActivities(session.userId, activities);

    const summary = buildTelemetrySummary(activities, new Date(), sleepMetrics);

    if (format === "json") {
      return NextResponse.json({ summary });
    }

    const svg = buildTelemetrySummarySvg(summary, theme, units, variant);
    if (format === "svg") {
      return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
    }
    // Only the real "Save as image" click sends format=png — the panel's
    // own JSON load (format=json, used just to render the live view)
    // isn't an export and shouldn't count as one.
    trackEvent(request, session.userId, "export_share", { source: "save_image", panel: "telemetry_summary" });
    const png = await svgToPng(svg);
    return new NextResponse(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (e) {
    console.error("Telemetry summary render failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
