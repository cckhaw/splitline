// Builds the telemetry summary infographic as a downloadable image — the
// on-page dashboard now renders this same data as a live HTML panel
// (components/TelemetryPanel.js) for readability/accessibility, but
// "Save as image" still needs a flat, postable picture, in either a
// desktop (wide) or mobile (tall) layout depending on the saving
// device — hence the two layout functions below sharing one data prep.

import { THEMES, esc } from "./svg.js";
import { prepareTelemetryDisplay } from "./telemetryDisplay.js";

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

function buildGauge(cx, cy, r, bandWidth, d, zoneHex, fs) {
  const zones = [
    { from: 180, to: 120, color: zoneHex.teal },
    { from: 120, to: 60, color: zoneHex.amber },
    { from: 60, to: 0, color: zoneHex.coral },
  ];
  const bands = zones.map((z) => gaugeBand(cx, cy, r, z.from, z.to, z.color, bandWidth)).join("");
  const needleAngle = 180 * (1 - d.fatigueScore / 100);
  const needleTip = polar(cx, cy, r - bandWidth / 2 - 10, needleAngle);
  const zoneColorHex = { fresh: zoneHex.teal, moderate: zoneHex.amber, fatigued: zoneHex.coral }[d.zoneKey] || fs.ink;
  return `
    ${bands}
    <line x1="${cx}" y1="${cy}" x2="${needleTip.x.toFixed(1)}" y2="${needleTip.y.toFixed(1)}" stroke="${fs.ink}" stroke-width="${fs.needleWidth}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${fs.hubR}" fill="${fs.ink}"/>
    <text x="${cx}" y="${cy + fs.scoreDy}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${fs.scoreSize}" font-weight="600" fill="${zoneColorHex}">${d.fatigueScore}</text>
    <text x="${cx}" y="${cy + fs.zoneDy}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="${fs.zoneSize}" font-weight="500" fill="${fs.dim}">${esc(d.zoneLabel)}</text>
    <text x="${cx}" y="${cy + fs.captionDy}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="${fs.captionSize}" font-weight="500" fill="${fs.dim}">${d.hoursSinceLastActivity != null ? `${Math.round(d.hoursSinceLastActivity)}h since last activity` : ""}</text>`;
}

// A simple bar trend (matches the HTML panel's CSS-bar rendering) rather
// than a smoothed line — one less code path to keep visually in sync.
function buildTrendBars(d, box, accent, dim) {
  if (!d.hasTrend) {
    return `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="${box.emptyFont}" font-weight="500" fill="${dim}">Import a few more activities to see a trend here</text>`;
  }
  const min = Math.min(...d.trace), max = Math.max(...d.trace), range = max - min || 1;
  const gap = box.barGap;
  const barW = (box.w - gap * (d.trace.length - 1)) / d.trace.length;
  return d.trace.map((v, i) => {
    const h = Math.max(4, ((v - min) / range) * box.h);
    const x = box.x + i * (barW + gap);
    const y = box.y + box.h - h;
    const isLast = i === d.trace.length - 1;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${isLast ? accent : dim}" opacity="${isLast ? 1 : 0.45}"/>`;
  }).join("");
}

function tileCell(s, x, y, w, h, t, fs) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${t.line}"/>
    <text x="${x + fs.pad}" y="${y + fs.labelDy}" font-family="Space Grotesk, sans-serif" font-size="${fs.labelSize}" font-weight="500" fill="${t.dim}">${esc(s.label)}</text>
    <text x="${x + fs.pad}" y="${y + fs.valueDy}" font-family="IBM Plex Mono, monospace" font-size="${fs.valueSize}" font-weight="600" fill="${t.ink}">${esc(s.value)}<tspan font-size="${fs.unitSize}" fill="${t.dim}" dx="6">${esc(s.unit)}</tspan></text>`;
}

function buildDesktopSvg(summary, theme, units) {
  const t = THEMES[theme || "ink"];
  const zoneHex = { teal: t.secondary, amber: t.accent, coral: "#D2604B" };
  const W = 1600, H = 900, marginX = 72;
  const d = prepareTelemetryDisplay(summary, units);

  const gx = 1170, gy = 470, gr = 220, bandWidth = 46;
  const gaugeMarkup = buildGauge(gx, gy, gr, bandWidth, d, zoneHex, {
    ink: t.ink, dim: t.dim, needleWidth: 6, hubR: 14,
    scoreDy: 60, scoreSize: 64.4, zoneDy: 96, zoneSize: 23, captionDy: 124, captionSize: 18.4,
  });

  const chartBox = { x: marginX, y: 700, w: W - marginX * 2, h: 130, barGap: 3, emptyFont: 20.7 };
  const trendMarkup = buildTrendBars(d, chartBox, t.accent, t.secondary);

  const tileFs = { pad: 20, labelDy: 34, labelSize: 20.7, valueDy: 78, valueSize: 39.1, unitSize: 18.4 };
  const tileCells = d.tiles.map((s, i) => {
    const cw = (780 - 24 * (d.tiles.length - 1)) / Math.max(1, d.tiles.length);
    return tileCell(s, marginX + i * (cw + 24), 560, cw, 108, t, tileFs);
  }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <text x="${marginX}" y="72" font-family="Space Grotesk, sans-serif" font-size="34.5" font-weight="700" fill="${t.ink}">Training summary</text>
  <text x="${W - marginX}" y="72" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="23" font-weight="500" fill="${t.dim}">${esc(d.periodFrom)} – ${esc(d.periodTo)} · ${d.sampleSize} activities</text>
  <line x1="${marginX}" y1="96" x2="${W - marginX}" y2="96" stroke="${t.line}" stroke-width="1"/>

  <text x="${marginX}" y="200" font-family="Space Grotesk, sans-serif" font-size="25.3" font-weight="500" fill="${t.dim}">Total training time</text>
  <text x="${marginX}" y="320" font-family="IBM Plex Mono, monospace" font-size="172.5" font-weight="600" fill="${t.accent}">${esc(d.totalHoursStr)}<tspan font-size="39.1" font-weight="500" fill="${t.dim}" dx="14">hours</tspan></text>
  <text x="${marginX}" y="365" font-family="Space Grotesk, sans-serif" font-size="23" font-weight="500" fill="${t.dim}">across ${d.periodDays} days${d.acwr != null ? ` · acute:chronic load ${d.acwr}` : ""}</text>

  ${tileCells}

  <text x="${gx}" y="230" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="25.3" font-weight="500" fill="${t.dim}">Fatigue</text>
  ${gaugeMarkup}

  <text x="${chartBox.x}" y="${chartBox.y - 18}" font-family="Space Grotesk, sans-serif" font-size="23" font-weight="500" fill="${t.dim}">Training intensity across the period</text>
  ${trendMarkup}

  <text x="${marginX}" y="${H - 40}" font-family="Space Grotesk, sans-serif" font-size="25.3" font-weight="500" fill="${t.dim}">SPLITLINE</text>
  <text x="${W - marginX}" y="${H - 40}" text-anchor="end" font-family="Space Grotesk, sans-serif" font-size="20.7" font-weight="500" fill="${t.dim}">${esc(d.movingTimeStr)} total moving time</text>
</svg>`;
}

// Portrait layout for saving from a phone browser — same data, stacked
// into one column instead of the desktop's hero+gauge side-by-side, with
// its own smaller type scale sized for a ~900px-wide canvas.
function buildMobileSvg(summary, theme, units) {
  const t = THEMES[theme || "ink"];
  const zoneHex = { teal: t.secondary, amber: t.accent, coral: "#D2604B" };
  const W = 900, marginX = 44;
  const d = prepareTelemetryDisplay(summary, units);

  const tileFs = { pad: 16, labelDy: 24, labelSize: 14, valueDy: 56, valueSize: 27, unitSize: 13 };
  const tileW = (W - marginX * 2 - 14) / 2;
  const tileH = 92;
  const tileRows = Math.ceil(d.tiles.length / 2);
  const tilesTop = 330;
  const tileCells = d.tiles.map((s, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    return tileCell(s, marginX + col * (tileW + 14), tilesTop + row * (tileH + 14), tileW, tileH, t, tileFs);
  }).join("");
  const tilesBottom = d.tiles.length ? tilesTop + tileRows * (tileH + 14) : tilesTop - 20;

  const gx = W / 2, gy = tilesBottom + 210, gr = 150, bandWidth = 30;
  const gaugeMarkup = buildGauge(gx, gy, gr, bandWidth, d, zoneHex, {
    ink: t.ink, dim: t.dim, needleWidth: 5, hubR: 10,
    scoreDy: 46, scoreSize: 44, zoneDy: 74, zoneSize: 16, captionDy: 98, captionSize: 13,
  });

  const chartTop = gy + 160;
  const chartBox = { x: marginX, y: chartTop, w: W - marginX * 2, h: 120, barGap: 2, emptyFont: 14 };
  const trendMarkup = buildTrendBars(d, chartBox, t.accent, t.secondary);

  const H = chartTop + chartBox.h + 80;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <text x="${marginX}" y="52" font-family="Space Grotesk, sans-serif" font-size="26" font-weight="700" fill="${t.ink}">Training summary</text>
  <text x="${marginX}" y="78" font-family="IBM Plex Mono, monospace" font-size="15" font-weight="500" fill="${t.dim}">${esc(d.periodFrom)} – ${esc(d.periodTo)} · ${d.sampleSize} activities</text>
  <line x1="${marginX}" y1="94" x2="${W - marginX}" y2="94" stroke="${t.line}" stroke-width="1"/>

  <text x="${marginX}" y="140" font-family="Space Grotesk, sans-serif" font-size="17" font-weight="500" fill="${t.dim}">Total training time</text>
  <text x="${marginX}" y="230" font-family="IBM Plex Mono, monospace" font-size="96" font-weight="600" fill="${t.accent}">${esc(d.totalHoursStr)}<tspan font-size="22" font-weight="500" fill="${t.dim}" dx="10">hours</tspan></text>
  <text x="${marginX}" y="262" font-family="Space Grotesk, sans-serif" font-size="15" font-weight="500" fill="${t.dim}">across ${d.periodDays} days${d.acwr != null ? ` · ACWR ${d.acwr}` : ""}</text>

  ${tileCells}

  <text x="${gx}" y="${gy - gr - 22}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="17" font-weight="500" fill="${t.dim}">Fatigue</text>
  ${gaugeMarkup}

  <text x="${chartBox.x}" y="${chartBox.y - 14}" font-family="Space Grotesk, sans-serif" font-size="15" font-weight="500" fill="${t.dim}">Training intensity across the period</text>
  ${trendMarkup}

  <text x="${marginX}" y="${H - 30}" font-family="Space Grotesk, sans-serif" font-size="16" font-weight="500" fill="${t.dim}">SPLITLINE</text>
  <text x="${W - marginX}" y="${H - 30}" text-anchor="end" font-family="Space Grotesk, sans-serif" font-size="14" font-weight="500" fill="${t.dim}">${esc(d.movingTimeStr)} total moving time</text>
</svg>`;
}

export function buildTelemetrySummarySvg(summary, theme, units = "metric", variant = "desktop") {
  return variant === "mobile" ? buildMobileSvg(summary, theme, units) : buildDesktopSvg(summary, theme, units);
}
