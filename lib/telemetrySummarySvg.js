// Builds the telemetry summary infographic — one card that replaces the
// previous per-activity gallery: total training time across the period,
// a fatigue gauge (recency + load heuristic, see lib/fatigue.js), and a
// training-intensity trend across the same activities. Same rendering
// approach as lib/svg.js's per-activity card (a hand-built SVG string,
// rasterized to PNG by lib/renderPng.js) so it's just as responsive
// (scales cleanly at any width, being vector) and just as saveable.

import { THEMES, esc, tracePath, fmtHMS } from "./svg.js";

const ZONE_COLOR = { fresh: "teal", moderate: "amber", fatigued: "coral" };
const ZONE_LABEL = { fresh: "Fresh", moderate: "Moderate fatigue", fatigued: "Fatigued — prioritize recovery" };

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// A single band segment of the gauge, drawn as a thick stroked arc.
function gaugeBand(cx, cy, r, startAngle, endAngle, color, width) {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `<path d="M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="butt"/>`;
}

function paceStr(minPerKm) {
  if (minPerKm == null) return null;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildTelemetrySummarySvg(summary, theme, units = "metric") {
  const t = THEMES[theme || "ink"];
  const zoneHex = { teal: t.secondary, amber: t.accent, coral: "#D2604B" };
  const W = 1600, H = 900, marginX = 72;

  const mi = units === "imperial";
  const totalHours = summary.totalMovingMin / 60;
  const totalHoursStr = totalHours >= 10 ? totalHours.toFixed(0) : totalHours.toFixed(1);

  const periodFrom = new Date(summary.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const periodTo = new Date(summary.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // ---- fatigue gauge (semi-circle, three zones, needle) ----
  const gx = 1170, gy = 470, gr = 220, bandWidth = 46;
  const zones = [
    { from: 180, to: 120, color: zoneHex.teal },
    { from: 120, to: 60, color: zoneHex.amber },
    { from: 60, to: 0, color: zoneHex.coral },
  ];
  const gaugeBands = zones.map((z) => gaugeBand(gx, gy, gr, z.from, z.to, z.color, bandWidth)).join("");
  const needleAngle = 180 * (1 - (summary.fatigue.score || 0) / 100);
  const needleTip = polar(gx, gy, gr - bandWidth / 2 - 10, needleAngle);
  const zoneColorHex = zoneHex[ZONE_COLOR[summary.fatigue.zone]] || t.ink;

  // ---- intensity trend (thin line + light fill, direct end label) ----
  // tracePath divides by (length - 1) to place points, which is undefined
  // for a single activity — that case renders a caption instead of a chart.
  const trace = summary.loadSeries.map((p) => p.load);
  const hasTrend = trace.length >= 2;
  const chartBox = { x: marginX, y: 700, w: W - marginX * 2, h: 130 };
  const { line, fill } = hasTrend ? tracePath(trace, chartBox.x, chartBox.y, chartBox.w, chartBox.h) : { line: "", fill: "" };
  const lastX = chartBox.x + chartBox.w;
  const lastLoad = hasTrend ? trace[trace.length - 1] : null;
  const minLoad = hasTrend ? Math.min(...trace) : 0;
  const maxLoad = hasTrend ? Math.max(...trace) : 0;

  // ---- secondary stat tiles: whichever of HR/power/pace/temp exist ----
  const tiles = [];
  if (summary.avgHr != null) tiles.push({ label: "Avg heart rate", value: summary.avgHr.toString(), unit: "bpm" });
  if (summary.avgWatts != null) tiles.push({ label: "Avg power", value: summary.avgWatts.toString(), unit: "W" });
  if (summary.avgPaceMinPerKm != null) {
    const pace = mi ? summary.avgPaceMinPerKm * 1.60934 : summary.avgPaceMinPerKm;
    tiles.push({ label: "Avg pace", value: paceStr(pace), unit: mi ? "/mi" : "/km" });
  }
  if (summary.avgTempC != null) {
    const tempVal = mi ? Math.round(summary.avgTempC * 9 / 5 + 32) : Math.round(summary.avgTempC);
    tiles.push({ label: "Avg recorded temp", value: tempVal.toString(), unit: mi ? "°F" : "°C" });
  }
  const tileCells = tiles.slice(0, 4).map((s, i) => {
    const cw = (780 - 24 * (tiles.length - 1)) / Math.max(1, tiles.length);
    const cx = marginX + i * (cw + 24);
    const cy = 560;
    return `
      <rect x="${cx}" y="${cy}" width="${cw}" height="108" rx="6" fill="none" stroke="${t.line}"/>
      <text x="${cx + 20}" y="${cy + 34}" font-family="Space Grotesk, sans-serif" font-size="18" font-weight="500" fill="${t.dim}">${esc(s.label)}</text>
      <text x="${cx + 20}" y="${cy + 78}" font-family="IBM Plex Mono, monospace" font-size="34" font-weight="600" fill="${t.ink}">${esc(s.value)}<tspan font-size="16" fill="${t.dim}" dx="6">${esc(s.unit)}</tspan></text>`;
  }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <text x="${marginX}" y="72" font-family="Space Grotesk, sans-serif" font-size="30" font-weight="700" fill="${t.ink}">Training summary</text>
  <text x="${W - marginX}" y="72" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="500" fill="${t.dim}">${esc(periodFrom)} – ${esc(periodTo)} · ${summary.sampleSize} activities</text>
  <line x1="${marginX}" y1="96" x2="${W - marginX}" y2="96" stroke="${t.line}" stroke-width="1"/>

  <text x="${marginX}" y="200" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="500" fill="${t.dim}">Total training time</text>
  <text x="${marginX}" y="320" font-family="IBM Plex Mono, monospace" font-size="150" font-weight="600" fill="${t.accent}">${esc(totalHoursStr)}<tspan font-size="34" font-weight="500" fill="${t.dim}" dx="14">hours</tspan></text>
  <text x="${marginX}" y="365" font-family="Space Grotesk, sans-serif" font-size="20" font-weight="500" fill="${t.dim}">across ${summary.periodDays} days${summary.acwr != null ? ` · acute:chronic load ${summary.acwr}` : ""}</text>

  ${tileCells}

  <text x="${gx}" y="230" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="500" fill="${t.dim}">Fatigue</text>
  ${gaugeBands}
  <line x1="${gx}" y1="${gy}" x2="${needleTip.x.toFixed(1)}" y2="${needleTip.y.toFixed(1)}" stroke="${t.ink}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${gx}" cy="${gy}" r="14" fill="${t.ink}"/>
  <text x="${gx}" y="${gy + 60}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="56" font-weight="600" fill="${zoneColorHex}">${summary.fatigue.score}</text>
  <text x="${gx}" y="${gy + 96}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="20" font-weight="500" fill="${t.dim}">${esc(ZONE_LABEL[summary.fatigue.zone] || "")}</text>
  <text x="${gx}" y="${gy + 124}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="16" font-weight="500" fill="${t.dim}">${summary.fatigue.hoursSinceLastActivity != null ? `${Math.round(summary.fatigue.hoursSinceLastActivity)}h since last activity` : ""}</text>

  <text x="${chartBox.x}" y="${chartBox.y - 18}" font-family="Space Grotesk, sans-serif" font-size="20" font-weight="500" fill="${t.dim}">Training intensity across the period</text>
  ${hasTrend ? `
  <path d="${fill}" fill="${t.secondary}" opacity="0.22"/>
  <path d="${line}" fill="none" stroke="${t.secondary}" stroke-width="3"/>
  ${lastLoad != null ? `<circle cx="${lastX.toFixed(1)}" cy="${(chartBox.y + chartBox.h - ((lastLoad - minLoad) / ((maxLoad - minLoad) || 1)) * chartBox.h).toFixed(1)}" r="5" fill="${t.accent}"/>` : ""}`
  : `<text x="${chartBox.x + chartBox.w / 2}" y="${chartBox.y + chartBox.h / 2}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="18" font-weight="500" fill="${t.dim}">Import a few more activities to see a trend here</text>`}

  <text x="${marginX}" y="${H - 40}" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="500" fill="${t.dim}">SPLITLINE</text>
  <text x="${W - marginX}" y="${H - 40}" text-anchor="end" font-family="Space Grotesk, sans-serif" font-size="18" font-weight="500" fill="${t.dim}">${esc(fmtHMS(summary.totalMovingMin))} total moving time</text>
</svg>`;
}
