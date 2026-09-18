import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { svgToPng } from "@/lib/renderPng";
import { buildShareSvg, buildSharePdf } from "@/lib/shareCard";
import {
  buildBiomechanicalShareContent,
  buildTrainingPlanShareContent,
  buildRaceDayShareContent,
} from "@/lib/shareContent";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";

const BUILDERS = {
  biomechanical: buildBiomechanicalShareContent,
  "training-plan": buildTrainingPlanShareContent,
  "race-day": buildRaceDayShareContent,
};

const FILE_STEMS = {
  biomechanical: "splitline-biomechanical-shield",
  "training-plan": "splitline-training-plan",
  "race-day": "splitline-race-day-plan",
};

// The client already has this exact panel's data in memory (it's what's on
// screen) — this just reformats it into a branded document rather than
// re-fetching or regenerating anything, so the payload is trusted the same
// way /api/overlay trusts a client-provided theme/units choice.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { kind, format, payload } = await request.json();
  const buildContent = BUILDERS[kind];
  if (!buildContent) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  if (format !== "pdf" && format !== "png") return NextResponse.json({ error: "invalid_format" }, { status: 400 });

  let model;
  try {
    model = buildContent(payload || {});
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  trackEvent(request, session.userId, "export_share", { source: "share_button", panel: kind, format });

  const stem = FILE_STEMS[kind];
  if (format === "png") {
    const svg = await buildShareSvg(model);
    const png = await svgToPng(svg);
    return new NextResponse(png, {
      headers: {
        "content-type": "image/png",
        "content-disposition": `attachment; filename="${stem}.png"`,
        "cache-control": "no-store",
      },
    });
  }

  const pdf = await buildSharePdf(model);
  return new NextResponse(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${stem}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
