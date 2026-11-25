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

  // Reject oversized bodies before parsing/rendering a PNG or PDF.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > 256 * 1024) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const text = await request.text();
  if (text.length > 256 * 1024) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let parsed;
  try { parsed = JSON.parse(text); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const { kind, format, payload } = parsed || {};
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
