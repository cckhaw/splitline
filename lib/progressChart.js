// A small "training progress" illustration: relative training load
// across the plan's phases, as a single-series line+area chart. Per the
// house dataviz approach — one series needs no legend (the caption names
// it), direct labels beat a numeric axis for a handful of points, thin
// 2px line, >=8px markers, color carries the one series (the app's own
// amber accent) while text stays in ink/dim tokens.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// theme: { bg, ink, inkDim, accent, line }
// `scale` grows fonts/markers/padding together (independent of width/height,
// which just size the plot area) — the live Training Plan/Race Day pages
// call this at scale=1, while lib/shareCard.js's "Save as image"/PDF export
// passes 1.2 so its embedded chart matches the 20%-bigger text used
// everywhere else in that export, without changing the on-page chart.
export function buildProgressChartSvg(phases, theme, { width = 900, height = 280, scale = 1 } = {}) {
  const padX = 50 * scale;
  const padTop = 46 * scale;
  const padBottom = 46 * scale;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const baseline = padTop + plotH;

  const n = phases.length;
  const points = phases.map((p, i) => {
    const x = n > 1 ? padX + (i / (n - 1)) * plotW : padX + plotW / 2;
    const load = Math.max(0, Math.min(100, Number(p.relative_load) || 0));
    const y = baseline - (load / 100) * plotH;
    return { x, y, load, name: p.name };
  });

  const linePath = points.map((p, i) => (i === 0 ? `M${p.x.toFixed(1)},${p.y.toFixed(1)}` : `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;

  const markers = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${6 * scale}" fill="${theme.accent}" stroke="${theme.bg}" stroke-width="2"/>`).join("");

  const valueLabels = points.map((p, i) => {
    const ly = Math.max(padTop - 16 * scale, p.y - 16 * scale);
    const anchor = n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle";
    return `<text x="${p.x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-family="IBM Plex Mono, monospace" font-size="${16 * scale}" font-weight="600" fill="${theme.ink}">${p.load}</text>`;
  }).join("");

  // The first/last labels sit right at the plot's left/right edge — with
  // text-anchor="middle" a long phase name (e.g. "Reload & Re-entry")
  // extends past x=0 or x=width. A browser doesn't clip an outermost
  // <svg>'s overflow, so this was invisible on the live page, but
  // @resvg/resvg-js (used to rasterize the "Save as image" export) clips
  // to the canvas bounds, silently cutting the label off — anchoring the
  // end labels inward (start/end instead of middle) keeps them on-canvas
  // in both renderers.
  const nameLabels = points.map((p, i) => {
    const anchor = n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle";
    return `<text x="${p.x.toFixed(1)}" y="${(baseline + 26 * scale).toFixed(1)}" text-anchor="${anchor}" font-family="Space Grotesk, sans-serif" font-size="${15 * scale}" fill="${theme.inkDim}">${esc(p.name)}</text>`;
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${padX}" y1="${baseline}" x2="${width - padX}" y2="${baseline}" stroke="${theme.line}" stroke-width="1"/>
  <path d="${areaPath}" fill="${theme.accent}" opacity="0.16"/>
  <path d="${linePath}" fill="none" stroke="${theme.accent}" stroke-width="2.5"/>
  ${markers}
  ${valueLabels}
  ${nameLabels}
</svg>`;
}
