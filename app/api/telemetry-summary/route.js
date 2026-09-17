import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, friendlyDbErrorMessage } from "@/lib/db";
import { buildTelemetrySummary } from "@/lib/telemetrySummary";
import { buildTelemetrySummarySvg } from "@/lib/telemetrySummarySvg";
import { svgToPng } from "@/lib/renderPng";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { theme = "ink", units = "metric", format = "png" } = await request.json().catch(() => ({}));

  try {
    const activities = await getActivitiesForUser(session.userId, 30);
    if (!activities.length) {
      return NextResponse.json({ error: "no_data", message: "Import activities first." }, { status: 400 });
    }
    const summary = buildTelemetrySummary(activities);
    const svg = buildTelemetrySummarySvg(summary, theme, units);

    if (format === "svg") {
      return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
    }
    const png = await svgToPng(svg);
    return new NextResponse(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (e) {
    console.error("Telemetry summary render failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
