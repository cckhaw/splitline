// Elevation-vs-distance illustration for an uploaded GPX race course —
// same house style as lib/progressChart.js: thin line, a soft area fill,
// direct labels on the two points that actually matter (the high point
// and the low point) rather than a full numeric y-axis, and the site's
// own accent color carrying the one series since a single series needs
// no legend.

// profile: [{distanceKm, elevationM}] (lib/gpxCourse.js's `profile`
// output — already resampled to a chart-friendly point count).
// theme: { bg, ink, inkDim, accent, line }.
export function buildCourseProfileChartSvg(profile, theme, { width = 900, height = 260 } = {}) {
  const padX = 54;
  const padTop = 40;
  const padBottom = 40;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const baseline = padTop + plotH;

  const pts = (profile || []).filter((p) => p.elevationM != null);
  if (pts.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="14" fill="${theme.inkDim}">No elevation data in this GPX file</text>
</svg>`;
  }

  const totalKm = pts[pts.length - 1].distanceKm;
  const elevations = pts.map((p) => p.elevationM);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const eleRange = Math.max(1, maxEle - minEle);
  const rangePad = eleRange * 0.12;
  const yMin = minEle - rangePad;
  const yMax = maxEle + rangePad;

  const xFor = (km) => padX + (totalKm > 0 ? (km / totalKm) * plotW : 0);
  const yFor = (ele) => baseline - ((ele - yMin) / (yMax - yMin)) * plotH;

  const points = pts.map((p) => ({ x: xFor(p.distanceKm), y: yFor(p.elevationM), ele: p.elevationM }));
  const linePath = points.map((p, i) => (i === 0 ? `M${p.x.toFixed(1)},${p.y.toFixed(1)}` : `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;

  const peak = points.reduce((a, b) => (b.ele > a.ele ? b : a));
  const low = points.reduce((a, b) => (b.ele < a.ele ? b : a));

  const peakMark = `<circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="5" fill="${theme.accent}" stroke="${theme.bg}" stroke-width="2"/>
  <text x="${peak.x.toFixed(1)}" y="${Math.max(padTop - 10, peak.y - 12).toFixed(1)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="14" font-weight="600" fill="${theme.ink}">${Math.round(peak.ele)}m</text>`;

  const lowMark = low === peak ? "" : `<circle cx="${low.x.toFixed(1)}" cy="${low.y.toFixed(1)}" r="5" fill="${theme.inkDim}" stroke="${theme.bg}" stroke-width="2"/>
  <text x="${low.x.toFixed(1)}" y="${Math.min(baseline + padBottom - 8, low.y + 20).toFixed(1)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="14" font-weight="600" fill="${theme.inkDim}">${Math.round(low.ele)}m</text>`;

  const endLabels = `<text x="${padX}" y="${(baseline + 26).toFixed(1)}" text-anchor="start" font-family="Space Grotesk, sans-serif" font-size="14" fill="${theme.inkDim}">Start</text>
  <text x="${(width - padX).toFixed(1)}" y="${(baseline + 26).toFixed(1)}" text-anchor="end" font-family="Space Grotesk, sans-serif" font-size="14" fill="${theme.inkDim}">Finish · ${totalKm.toFixed(1)}km</text>`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${padX}" y1="${baseline}" x2="${width - padX}" y2="${baseline}" stroke="${theme.line}" stroke-width="1"/>
  <path d="${areaPath}" fill="${theme.accent}" opacity="0.16"/>
  <path d="${linePath}" fill="none" stroke="${theme.accent}" stroke-width="2"/>
  ${peakMark}
  ${lowMark}
  ${endLabels}
</svg>`;
}
