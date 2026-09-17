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
export function buildProgressChartSvg(phases, theme, { width = 900, height = 280 } = {}) {
  const padX = 50;
  const padTop = 46;
  const padBottom = 46;
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

  const markers = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="${theme.accent}" stroke="${theme.bg}" stroke-width="2"/>`).join("");

  const valueLabels = points.map((p) => {
    const ly = Math.max(padTop - 16, p.y - 16);
    return `<text x="${p.x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="16" font-weight="600" fill="${theme.ink}">${p.load}</text>`;
  }).join("");

  const nameLabels = points.map((p) => {
    return `<text x="${p.x.toFixed(1)}" y="${(baseline + 26).toFixed(1)}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="15" fill="${theme.inkDim}">${esc(p.name)}</text>`;
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
