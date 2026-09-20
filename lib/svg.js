// Builds the Splitline telemetry overlay card as an SVG string.
// Shared by /api/overlay (rasterized to PNG for real Strava data) and
// /api/mcp (returned as SVG for any MCP client).

// Exported for lib/telemetrySummarySvg.js, which builds a different card
// (the aggregate telemetry summary) but wants the exact same palette and
// small drawing helpers rather than a second, driftable copy of them.
export const THEMES = {
  ink:    { bg: "#10151F", ink: "#ECE7DA", dim: "#8B93A6", accent: "#EFA33B", secondary: "#4C9C93", line: "rgba(236,231,218,0.14)" },
  paper:  { bg: "#ECE7DA", ink: "#171512", dim: "#6B6558", accent: "#C97B2E", secondary: "#2E6B65", line: "rgba(23,21,18,0.14)" },
  signal: { bg: "#0B0D12", ink: "#F3EFE6", dim: "#8D8A82", accent: "#E2603F", secondary: "#C98A3D", line: "rgba(243,239,230,0.14)" },
};

function paceFromSpeed(kmh) {
  if (!kmh || kmh <= 0) return "—";
  const minPerKm = 60 / kmh;
  const m = Math.floor(minPerKm), s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
export function fmtHMS(totalMin) {
  const totalSec = Math.round((totalMin || 0) * 60);
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function tracePath(values, x, y, w, h) {
  if (!values || !values.length) return { line: "", fill: "" };
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const px = x + (i / (values.length - 1)) * w;
    const py = y + h - ((v - min) / range) * h;
    return [px, py];
  });
  const line = pts.map((p, i) => (i === 0 ? `M${p[0].toFixed(1)},${p[1].toFixed(1)}` : `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)).join(" ");
  const fill = `${line} L${(x + w).toFixed(1)},${(y + h).toFixed(1)} L${x.toFixed(1)},${(y + h).toFixed(1)} Z`;
  return { line, fill };
}

// A uniform 1.2x "zoom" on the whole card — every dimension scales
// together (not just font-size values) so existing spacing ratios stay
// intact while landing 20% bigger and more readable, matching the same
// treatment given to lib/telemetrySummarySvg.js.
const FS = 1.2;

export function buildSvg(input) {
  const t = THEMES[input.theme || "ink"];
  const W = 1080 * FS, H = 1350 * FS, marginX = 84 * FS;
  const mi = input.units === "imperial";
  const distDisplay = mi ? (input.distance_km || 0) * 0.621371 : (input.distance_km || 0);
  const distUnit = mi ? "mi" : "km";
  const elevDisplay = mi ? Math.round((input.elevation_gain_m || 0) * 3.28084) : Math.round(input.elevation_gain_m || 0);
  const elevUnit = mi ? "ft" : "m";

  let heroValue = "—", heroUnit = "", heroLabel = "";
  const metric = input.hero_metric || (/run/i.test(input.sport || "") ? "pace" : input.avg_watts ? "power" : "speed");
  if (metric === "pace") {
    const kmh = input.avg_speed_kmh;
    heroValue = paceFromSpeed(mi ? kmh / 1.60934 : kmh); heroUnit = mi ? "/mi" : "/km"; heroLabel = "Average pace";
  } else if (metric === "power") {
    heroValue = Math.round(input.avg_watts || 0).toString(); heroUnit = "W"; heroLabel = "Average power";
  } else if (metric === "hr") {
    heroValue = Math.round(input.avg_hr || 0).toString(); heroUnit = "bpm"; heroLabel = "Average heart rate";
  } else {
    const kmh = input.avg_speed_kmh || 0; const v = mi ? kmh / 1.60934 : kmh;
    heroValue = v.toFixed(1); heroUnit = mi ? "mph" : "km/h"; heroLabel = "Average speed";
  }

  const trace = (input.trace && input.trace.length ? input.trace : null);
  const traceBox = { x: marginX, y: 610 * FS, w: W - marginX * 2, h: 150 * FS };
  const sampled = trace ? trace.filter((_, i) => i % Math.max(1, Math.floor(trace.length / 120)) === 0) : null;
  const { line, fill } = sampled ? tracePath(sampled, traceBox.x, traceBox.y, traceBox.w, traceBox.h) : { line: "", fill: "" };

  const stats = [
    { label: "Distance", value: distDisplay.toFixed(2), unit: distUnit },
    { label: "Moving time", value: fmtHMS(input.moving_min), unit: "" },
    { label: "Elevation gain", value: elevDisplay.toString(), unit: elevUnit },
  ];
  if (input.avg_hr) stats.push({ label: "Avg heart rate", value: Math.round(input.avg_hr).toString(), unit: "bpm" });
  if (input.avg_watts) stats.push({ label: "Avg power", value: Math.round(input.avg_watts).toString(), unit: "W" });
  if (input.calories) stats.push({ label: "Calories", value: Math.round(input.calories).toString(), unit: "kcal" });

  const statCells = stats.slice(0, 6).map((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const cx = marginX + col * ((W - marginX * 2) / 3);
    const cy = 860 * FS + row * 96 * FS;
    return `
      <text x="${cx}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="${19 * FS}" font-weight="500" fill="${t.dim}">${esc(s.label)}</text>
      <text x="${cx}" y="${cy + 40 * FS}" font-family="IBM Plex Mono, monospace" font-size="${40 * FS}" font-weight="600" fill="${t.ink}">${esc(s.value)}${s.unit ? `<tspan font-size="${18 * FS}" fill="${t.dim}" dx="8">${esc(s.unit)}</tspan>` : ""}</text>`;
  }).join("");

  const dateStr = new Date(input.date || Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <text x="${marginX}" y="${96 * FS}" font-family="IBM Plex Mono, monospace" font-size="${26 * FS}" font-weight="500" fill="${t.dim}">${esc(dateStr)}</text>
  <text x="${W - marginX}" y="${96 * FS}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="${26 * FS}" font-weight="500" fill="${t.dim}">${esc(input.sport || "Workout")}</text>
  <line x1="${marginX}" y1="${122 * FS}" x2="${W - marginX}" y2="${122 * FS}" stroke="${t.line}" stroke-width="1"/>
  <text x="${marginX}" y="${212 * FS}" font-family="Space Grotesk, sans-serif" font-size="${52 * FS}" font-weight="700" fill="${t.ink}">${esc(input.name || "Untitled activity")}</text>
  <text x="${marginX}" y="${365 * FS}" font-family="IBM Plex Mono, monospace" font-size="${148 * FS}" font-weight="600" fill="${t.accent}">${esc(heroValue)}<tspan font-size="${30 * FS}" font-weight="500" fill="${t.dim}" dx="16">${esc(heroUnit)}</tspan></text>
  <text x="${marginX}" y="${405 * FS}" font-family="Space Grotesk, sans-serif" font-size="${22 * FS}" font-weight="500" fill="${t.dim}">${esc(heroLabel)}</text>
  ${sampled ? `<text x="${traceBox.x}" y="${traceBox.y - 14 * FS}" font-family="Space Grotesk, sans-serif" font-size="${20 * FS}" font-weight="500" fill="${t.dim}">${esc(input.trace_label || "Elevation")}</text>
  <path d="${fill}" fill="${t.secondary}" opacity="0.22"/>
  <path d="${line}" fill="none" stroke="${t.secondary}" stroke-width="3"/>` : ""}
  ${statCells}
  <text x="${marginX}" y="${H - 60 * FS}" font-family="Space Grotesk, sans-serif" font-size="${22 * FS}" font-weight="500" fill="${t.dim}">SPLITLINE</text>
  <text x="${W - marginX}" y="${H - 60 * FS}" text-anchor="end" font-family="Space Grotesk, sans-serif" font-size="${22 * FS}" font-weight="500" fill="${t.dim}">${esc(fmtHMS(input.moving_min))} moving</text>
</svg>`;
}
