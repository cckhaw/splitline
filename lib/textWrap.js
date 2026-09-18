// Canvas-free word wrap for the SVG/PDF share renderers (lib/shareCard.js).
// Neither resvg nor pdf-lib measures text for us ahead of layout, so this
// estimates width from an average per-character factor instead — good
// enough at the font sizes these documents use, and avoids pulling in a
// real text-measurement dependency for two brand fonts.
export function wrapText(text, maxWidthPx, fontSizePx, avgCharWidth = 0.52) {
  const maxChars = Math.max(4, Math.floor(maxWidthPx / (fontSizePx * avgCharWidth)));
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
