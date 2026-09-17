// Renders the "Training load & race pace" and "Injury risk, recovery &
// nutrition" dashboard panels as shareable cards, using satori (the same
// engine behind next/og) to lay them out with real flexbox — so text
// wraps naturally and the result reads like an actual screenshot of the
// panel rather than hand-positioned SVG text. Cards pick up whichever
// theme (dark/light) the viewer currently has selected, and — since
// satori/resvg do their own layout, not a browser — the "responsive"
// behavior is chosen directly per orientation rather than via a media
// query: portrait uses the same stacked/2-column layout the site's own
// CSS switches to below 860px, landscape uses the multi-column desktop
// layout.

import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { resolveTheme } from "./theme.js";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
function loadFont(file) {
  return fs.readFileSync(path.join(FONT_DIR, file));
}

let fontsCache = null;
function fonts() {
  if (!fontsCache) {
    fontsCache = [
      { name: "Space Grotesk", data: loadFont("SpaceGrotesk-Regular.ttf"), weight: 400, style: "normal" },
      { name: "Space Grotesk", data: loadFont("SpaceGrotesk-Medium.ttf"), weight: 500, style: "normal" },
      { name: "Space Grotesk", data: loadFont("SpaceGrotesk-Bold.ttf"), weight: 700, style: "normal" },
      { name: "IBM Plex Mono", data: loadFont("IBMPlexMono-Regular.ttf"), weight: 400, style: "normal" },
      { name: "IBM Plex Mono", data: loadFont("IBMPlexMono-Medium.ttf"), weight: 500, style: "normal" },
      { name: "IBM Plex Mono", data: loadFont("IBMPlexMono-SemiBold.ttf"), weight: 600, style: "normal" },
    ];
  }
  return fontsCache;
}

const RISK_COLOR_KEY = { low: "teal", moderate: "amber", high: "coral" };

function h(type, style, children) {
  return { type, props: { style, children } };
}

function dims(orientation) {
  const portrait = orientation !== "landscape";
  return portrait ? { width: 1080, height: 1920, portrait: true } : { width: 1920, height: 1080, portrait: false };
}

function fmtDuration(totalSeconds) {
  const h_ = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
  return h_ > 0 ? `${h_}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function header(T, scale) {
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return h("div", { display: "flex", flexDirection: "column", width: "100%" }, [
    h("div", { display: "flex", flexDirection: "row", justifyContent: "space-between", width: "100%" }, [
      h("div", { display: "flex", fontFamily: "IBM Plex Mono", fontSize: 24 * scale, color: T.inkDim }, dateStr),
      h("div", { display: "flex", fontWeight: 700, fontSize: 24 * scale }, [
        h("span", { display: "flex", color: T.ink }, "SPLIT"),
        h("span", { display: "flex", color: T.amber }, "LINE"),
      ]),
    ]),
    h("div", { display: "flex", width: "100%", height: 1, backgroundColor: T.line, marginTop: 20 * scale }),
  ]);
}

function footer(T, scale, text) {
  return h("div", { display: "flex", fontSize: 17 * scale, color: T.inkDim, marginTop: "auto", paddingTop: 24 * scale }, text);
}

function bulletList(items, T, scale) {
  return h("div", { display: "flex", flexDirection: "column", width: "100%" },
    (items || []).map((item) =>
      h("div", { display: "flex", flexDirection: "row", fontSize: 19 * scale, color: T.ink, marginBottom: 10 * scale, lineHeight: 1.4 }, [
        h("span", { display: "flex", color: T.amber, marginRight: 10 * scale }, "–"),
        h("span", { display: "flex", flex: 1 }, item),
      ])
    )
  );
}

export async function buildPredictionCard({ load, pace, sampleSize }, orientation, theme) {
  const { width, height, portrait } = dims(orientation);
  const T = resolveTheme(theme);
  const scale = portrait ? 1 : 1.15;
  const pad = portrait ? "64px 56px" : "72px 88px";

  const children = [
    header(T, scale),
    h("div", { display: "flex", fontSize: 46 * scale, fontWeight: 700, color: T.ink, marginTop: 36 * scale }, "Training load & race pace"),
  ];

  if (load?.acwr != null) {
    children.push(h("div", { display: "flex", fontFamily: "IBM Plex Mono", fontSize: 92 * scale, fontWeight: 600, color: T.amber, marginTop: 24 * scale }, String(load.acwr)));
  }
  children.push(h("div", { display: "flex", fontSize: 26 * scale, color: T.ink, marginTop: load?.acwr != null ? 8 * scale : 24 * scale }, load?.status || ""));
  if (load?.note) {
    children.push(h("div", { display: "flex", fontSize: 18 * scale, color: T.inkDim, marginTop: 14 * scale, lineHeight: 1.5 }, load.note));
  }

  if (pace) {
    children.push(h("div", { display: "flex", fontSize: 26 * scale, fontWeight: 500, color: T.inkDim, marginTop: 44 * scale }, "Race pace projection"));
    // portrait -> 2 columns (the site's own <600px breakpoint for .pace-grid); landscape -> 4 columns.
    const cols = portrait ? 2 : 4;
    const cellWidth = `${100 / cols}%`;
    children.push(
      h("div", { display: "flex", flexDirection: "row", flexWrap: "wrap", width: "100%", marginTop: 20 * scale }, pace.predictions.map((p) =>
        h("div", { display: "flex", flexDirection: "column", width: cellWidth, paddingTop: 14 * scale, paddingBottom: 14 * scale, paddingRight: 16 * scale }, [
          h("div", { display: "flex", fontSize: 17 * scale, color: T.inkDim }, p.label),
          h("div", { display: "flex", fontFamily: "IBM Plex Mono", fontSize: 34 * scale, fontWeight: 600, color: T.ink, marginTop: 6 * scale }, fmtDuration(p.seconds)),
        ])
      ))
    );
    children.push(h("div", { display: "flex", fontSize: 17 * scale, color: T.inkDim, marginTop: 16 * scale, lineHeight: 1.5 },
      `From your ${pace.referenceActivity.distanceKm}km effort — ${pace.note}`));
  } else {
    children.push(h("div", { display: "flex", fontSize: 20 * scale, color: T.inkDim, marginTop: 30 * scale }, "Not enough running activity yet for a race-pace projection."));
  }

  children.push(footer(T, scale, `Based on the last ${sampleSize} imported activities — a heuristic, not a coaching plan.`));

  const tree = h("div", { width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: T.bg, fontFamily: "Space Grotesk", padding: pad }, children);
  return satori(tree, { width, height, fonts: fonts() });
}

export async function buildInjuryCard({ ai }, orientation, theme) {
  const { width, height, portrait } = dims(orientation);
  const T = resolveTheme(theme);
  const scale = portrait ? 1 : 1.15;
  const pad = portrait ? "64px 56px" : "72px 88px";
  const riskColor = T[RISK_COLOR_KEY[ai.risk_level]] || T.ink;

  const sections = [
    { title: "Risk factors", items: ai.risk_factors },
    { title: "Recovery plan", items: ai.recovery_plan },
    { title: "Nutrition plan", items: ai.nutrition_plan },
  ];

  const sectionBlocks = sections.map((s) =>
    h("div", { display: "flex", flexDirection: "column", width: portrait ? "100%" : "31%", marginTop: 32 * scale }, [
      h("div", { display: "flex", fontSize: 16 * scale, fontWeight: 600, color: T.inkDim, textTransform: "uppercase", letterSpacing: 1 }, s.title),
      h("div", { display: "flex", marginTop: 12 * scale, width: "100%" }, bulletList(s.items, T, scale)),
    ])
  );

  const children = [
    header(T, scale),
    h("div", { display: "flex", fontSize: 46 * scale, fontWeight: 700, color: T.ink, marginTop: 36 * scale }, "Injury risk, recovery & nutrition"),
    h("div", {
      display: "flex", marginTop: 28 * scale, border: `2px solid ${riskColor}`, borderRadius: 4,
      padding: `${10 * scale}px ${18 * scale}px`, fontFamily: "IBM Plex Mono", fontSize: 22 * scale, fontWeight: 600, color: riskColor,
    }, `${(ai.risk_level || "").toUpperCase()} RISK · ${ai.risk_score}/100`),
    h("div", { display: "flex", fontSize: 23 * scale, color: T.ink, marginTop: 24 * scale, lineHeight: 1.5 }, ai.risk_summary),
    h("div", { display: "flex", flexDirection: "row", flexWrap: "wrap", width: "100%", justifyContent: "space-between" }, sectionBlocks),
    footer(T, scale, "AI-generated wellness heuristic from recent training — not medical advice."),
  ];

  const tree = h("div", { width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: T.bg, fontFamily: "Space Grotesk", padding: pad }, children);
  return satori(tree, { width, height, fonts: fonts() });
}
