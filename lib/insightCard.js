// Renders the "Training load & race pace" and "Injury risk, recovery &
// nutrition" dashboard panels as a shareable SVG card, in the same
// visual language as the per-activity overlay (lib/svg.js) but laid out
// for social posting rather than a single workout's telemetry.

const T = { bg: "#10151F", ink: "#ECE7DA", dim: "#8B93A6", accent: "#EFA33B", teal: "#4C9C93", coral: "#D2604B", line: "rgba(236,231,218,0.14)" };
const RISK_COLOR = { low: T.teal, moderate: T.accent, high: T.coral };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// Rough word-wrap for SVG text (no native reflow) — good enough for a
// generated card, not typeset precision.
function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const attempt = cur ? `${cur} ${w}` : w;
    if (attempt.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = attempt;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function dims(orientation) {
  const portrait = orientation !== "landscape";
  return { W: portrait ? 1080 : 1350, H: portrait ? 1350 : 1080, portrait, marginX: 84 };
}

function frame(W, H, marginX, title) {
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return [
    `<rect width="${W}" height="${H}" fill="${T.bg}"/>`,
    `<text x="${marginX}" y="96" font-family="IBM Plex Mono, monospace" font-size="24" fill="${T.dim}">${esc(dateStr)}</text>`,
    `<text x="${W - marginX}" y="96" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="24" font-weight="500" fill="${T.dim}">SPLITLINE</text>`,
    `<line x1="${marginX}" y1="122" x2="${W - marginX}" y2="122" stroke="${T.line}"/>`,
    `<text x="${marginX}" y="212" font-family="Space Grotesk, sans-serif" font-size="44" font-weight="700" fill="${T.ink}">${esc(title)}</text>`,
  ];
}

// A bounded bullet list — stops (with a "+N more" note) rather than
// overflowing the card once `maxY` is reached, since portrait/landscape
// give very different amounts of vertical room.
function drawBullets(parts, items, { x, y, maxY, maxChars, fontSize = 19, lineHeight = 26, gap = 10, color = T.ink }) {
  for (let i = 0; i < items.length; i++) {
    const lines = wrapText(items[i], maxChars);
    const blockHeight = lines.length * lineHeight;
    if (y + blockHeight > maxY) {
      const remaining = items.length - i;
      if (remaining > 0) {
        parts.push(`<text x="${x}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${fontSize}" fill="${T.dim}">+${remaining} more in the app</text>`);
        y += lineHeight;
      }
      return y;
    }
    lines.forEach((line, li) => {
      const prefix = li === 0 ? "– " : "  ";
      parts.push(`<text x="${x}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${fontSize}" fill="${color}">${esc(prefix + line)}</text>`);
      y += lineHeight;
    });
    y += gap;
  }
  return y;
}

export function buildPredictionCardSvg({ load, pace, sampleSize }, orientation = "portrait") {
  const { W, H, portrait, marginX } = dims(orientation);
  const wrapChars = portrait ? 62 : 88;
  const parts = frame(W, H, marginX, "Training load & race pace");
  let y = 300;

  if (load?.acwr != null) {
    parts.push(`<text x="${marginX}" y="${y}" font-family="IBM Plex Mono, monospace" font-size="88" font-weight="600" fill="${T.accent}">${load.acwr}</text>`);
    y += 56;
  }
  parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="26" fill="${T.ink}">${esc(load?.status || "")}</text>`);
  y += 44;
  if (load?.note) {
    for (const line of wrapText(load.note, wrapChars)) {
      parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="17" fill="${T.dim}">${esc(line)}</text>`);
      y += 24;
    }
  }
  y += 50;

  if (pace) {
    parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="26" font-weight="500" fill="${T.dim}">Race pace projection</text>`);
    y += 56;
    const cols = 4;
    const cellW = (W - marginX * 2) / cols;
    pace.predictions.forEach((p, i) => {
      const cx = marginX + i * cellW;
      parts.push(`<text x="${cx}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="17" fill="${T.dim}">${esc(p.label)}</text>`);
      parts.push(`<text x="${cx}" y="${y + 42}" font-family="IBM Plex Mono, monospace" font-size="32" font-weight="600" fill="${T.ink}">${esc(fmtDuration(p.seconds))}</text>`);
    });
    y += 90;
    for (const line of wrapText(`From your ${pace.referenceActivity.distanceKm}km effort — ${pace.note}`, wrapChars)) {
      parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="16" fill="${T.dim}">${esc(line)}</text>`);
      y += 22;
    }
  } else {
    parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="19" fill="${T.dim}">Not enough running activity yet for a race-pace projection.</text>`);
  }

  parts.push(`<text x="${marginX}" y="${H - 60}" font-family="Space Grotesk, sans-serif" font-size="17" fill="${T.dim}">Based on the last ${sampleSize} imported activities — a heuristic, not a coaching plan.</text>`);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;
}

export function buildInjuryCardSvg({ ai }, orientation = "portrait") {
  const { W, H, portrait, marginX } = dims(orientation);
  const wrapChars = portrait ? 62 : 88;
  const parts = frame(W, H, marginX, "Injury risk, recovery & nutrition");
  const maxY = H - 100;
  let y = 300;

  const riskColor = RISK_COLOR[ai.risk_level] || T.ink;
  const badgeLabel = `${(ai.risk_level || "").toUpperCase()} RISK · ${ai.risk_score}/100`;
  parts.push(`<rect x="${marginX}" y="${y - 34}" width="${28 + badgeLabel.length * 15}" height="46" rx="4" fill="none" stroke="${riskColor}" stroke-width="2"/>`);
  parts.push(`<text x="${marginX + 14}" y="${y - 2}" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="${riskColor}">${esc(badgeLabel)}</text>`);
  y += 40;

  for (const line of wrapText(ai.risk_summary, wrapChars)) {
    parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="21" fill="${T.ink}">${esc(line)}</text>`);
    y += 30;
  }
  y += 30;

  const sections = [
    { title: "RISK FACTORS", items: ai.risk_factors },
    { title: "RECOVERY PLAN", items: ai.recovery_plan },
    { title: "NUTRITION PLAN", items: ai.nutrition_plan },
  ];
  for (const section of sections) {
    if (y >= maxY) break;
    parts.push(`<text x="${marginX}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="17" font-weight="600" fill="${T.dim}" letter-spacing="1">${esc(section.title)}</text>`);
    y += 32;
    y = drawBullets(parts, section.items || [], { x: marginX, y, maxY, maxChars: wrapChars, fontSize: 18, lineHeight: 25, gap: 8 });
    y += 26;
  }

  parts.push(`<text x="${marginX}" y="${H - 60}" font-family="Space Grotesk, sans-serif" font-size="16" fill="${T.dim}">AI-generated wellness heuristic from recent training — not medical advice.</text>`);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;
}
