import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, getAiInsights } from "@/lib/db";
import { computeTrainingLoad, predictRacePaces } from "@/lib/insights";
import { buildPredictionCardSvg, buildInjuryCardSvg } from "@/lib/insightCard";
import { svgToPng } from "@/lib/renderPng";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { section, orientation = "portrait", format = "png" } = await request.json().catch(() => ({}));
  if (!["prediction", "injury"].includes(section)) {
    return NextResponse.json({ error: "invalid_section", message: "section must be 'prediction' or 'injury'." }, { status: 400 });
  }
  if (!["portrait", "landscape"].includes(orientation)) {
    return NextResponse.json({ error: "invalid_orientation", message: "orientation must be 'portrait' or 'landscape'." }, { status: 400 });
  }

  try {
    let svg;
    if (section === "prediction") {
      const activities = await getActivitiesForUser(session.userId, 30);
      if (!activities.length) {
        return NextResponse.json({ error: "no_data", message: "Import activities before exporting this card." }, { status: 400 });
      }
      svg = buildPredictionCardSvg(
        { load: computeTrainingLoad(activities), pace: predictRacePaces(activities), sampleSize: activities.length },
        orientation
      );
    } else {
      const cached = await getAiInsights(session.userId);
      if (!cached) {
        return NextResponse.json({ error: "no_analysis", message: "Generate an AI analysis on the dashboard first." }, { status: 400 });
      }
      svg = buildInjuryCardSvg({ ai: cached.payload }, orientation);
    }

    if (format === "svg") {
      return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
    }
    const png = await svgToPng(svg);
    return new NextResponse(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (e) {
    console.error("Insight card export failed:", e);
    return NextResponse.json({ error: "export_failed", message: String(e.message || e) }, { status: 500 });
  }
}
