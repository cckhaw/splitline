// Renders the generic "shareable document" content model (see
// lib/shareContent.js) into a branded PDF or a single tall branded PNG —
// used by /api/share for the Biomechanical panel, Training Plan, and
// Race-day Plan "Share" buttons. Both renderers carry the same Splitline
// header/footer treatment: logo + wordmark, brand palette, a QR code back
// to the site, and a copyright line, per the "professionally formatted"
// ask.

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { wrapText } from "./textWrap.js";
import { qrPngBuffer } from "./qrCode.js";
import { SITE_URL } from "./site.js";
import { esc } from "./svg.js";
import { buildProgressChartSvg } from "./progressChart.js";
import { buildCourseProfileChartSvg } from "./courseProfileChart.js";
import { svgToPng } from "./renderPng.js";

// Documents always render in Splitline's light/paper palette regardless of
// the viewer's in-app theme — a shared PDF/PNG is meant to be read (and
// possibly printed) outside the app, so it stays legible and on-brand
// rather than following whatever theme happened to be active.
const PALETTE = {
  bg: "#F3EEE2", card: "#FCFAF4", ink: "#171512", inkDim: "#6B6558",
  brand: "#FD6130", brand2: "#0DBBED", subhead: "#0D8FB8", line: "rgba(23,21,18,0.16)",
  riskLow: "#0D9488", riskModerate: "#F59E0B", riskHigh: "#E11D48",
};

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

function riskColor(level) {
  const l = String(level || "").toLowerCase();
  if (l.startsWith("low")) return PALETTE.riskLow;
  if (l.startsWith("high") || l.startsWith("severe")) return PALETTE.riskHigh;
  return PALETTE.riskModerate;
}

function siteHost() {
  try { return new URL(SITE_URL).host; } catch { return SITE_URL; }
}

// ---------- SVG / PNG ----------

// A uniform 1.2x "zoom" on the whole card — every dimension scales
// together (not just font-size values) so existing spacing ratios stay
// intact while landing 20% bigger and more readable, matching the same
// treatment given to lib/telemetrySummarySvg.js and lib/svg.js.
const FS = 1.2;

const SVG_W = 1080 * FS;
const MARGIN_X = 84 * FS;

export async function buildShareSvg(model) {
  const logoB64 = fs.readFileSync(LOGO_PATH).toString("base64");
  const qrB64 = (await qrPngBuffer(SITE_URL, 220)).toString("base64");

  let y = 74 * FS;
  const parts = [];

  // Header: logo + wordmark
  parts.push(`<image href="data:image/png;base64,${logoB64}" x="${MARGIN_X}" y="${y - 40 * FS}" width="${52 * FS}" height="${52 * FS}"/>`);
  parts.push(`<text x="${MARGIN_X + 66 * FS}" y="${y - 6 * FS}" font-family="Space Grotesk, sans-serif" font-size="${28 * FS}" font-weight="700" fill="${PALETTE.brand}">SPLIT<tspan fill="${PALETTE.ink}">LINE</tspan></text>`);
  parts.push(`<text x="${SVG_W - MARGIN_X}" y="${y - 6 * FS}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="${18 * FS}" font-weight="500" fill="${PALETTE.inkDim}">${esc(model.eyebrow)}</text>`);
  y += 40 * FS;
  parts.push(`<line x1="${MARGIN_X}" y1="${y}" x2="${SVG_W - MARGIN_X}" y2="${y}" stroke="${PALETTE.line}" stroke-width="1"/>`);
  y += 56 * FS;

  // Title + subtitle
  parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${42 * FS}" font-weight="700" fill="${PALETTE.ink}">${esc(model.title)}</text>`);
  y += 30 * FS;
  if (model.subtitle) {
    parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${20 * FS}" font-weight="500" fill="${PALETTE.inkDim}">${esc(model.subtitle)}</text>`);
    y += 30 * FS;
  }

  // Badge
  if (model.badge) {
    const bw = (model.badge.text.length * 12 + 48) * FS;
    parts.push(`<rect x="${MARGIN_X}" y="${y}" width="${bw}" height="${40 * FS}" rx="${20 * FS}" fill="${riskColor(model.badge.level)}"/>`);
    parts.push(`<text x="${MARGIN_X + bw / 2}" y="${y + 26 * FS}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="${18 * FS}" font-weight="600" fill="#FFFFFF">${esc(model.badge.text)}</text>`);
    y += 66 * FS;
  }

  // Stats row — labels are wrapped to their column width (some, like
  // "Aerobic decoupling (30d)", are too long to fit one line at 6 columns)
  // and the value row is positioned after however many lines the tallest
  // label needed, rather than a fixed offset that let a wrapped label run
  // into the value below it or a long unwrapped one bleed into the next
  // column.
  if (model.stats?.length) {
    const n = model.stats.length;
    const colW = (SVG_W - MARGIN_X * 2) / n;
    const labelSize = 17 * FS;
    const labelLineH = labelSize * 1.25;
    const colGap = 14 * FS;
    const statLabelLines = model.stats.map((s) => wrapText(s.label, colW - colGap, labelSize, 0.56));
    const maxLabelLines = Math.max(1, ...statLabelLines.map((l) => l.length));
    const valueY = y + maxLabelLines * labelLineH + 12 * FS;
    model.stats.forEach((s, i) => {
      const cx = MARGIN_X + i * colW;
      statLabelLines[i].forEach((line, li) => {
        parts.push(`<text x="${cx}" y="${y + li * labelLineH}" font-family="Space Grotesk, sans-serif" font-size="${labelSize}" font-weight="500" fill="${PALETTE.inkDim}">${esc(line)}</text>`);
      });
      parts.push(`<text x="${cx}" y="${valueY}" font-family="IBM Plex Mono, monospace" font-size="${36 * FS}" font-weight="600" fill="${PALETTE.ink}">${esc(s.value)}</text>`);
    });
    y = valueY + 28 * FS;
  }

  // Sections
  for (const section of model.sections) {
    y += 12 * FS;
    parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${24 * FS}" font-weight="700" fill="${PALETTE.ink}">${esc(section.heading)}</text>`);
    y += 34 * FS;

    if (section.kind === "paragraph") {
      const lines = wrapText(section.text || "", SVG_W - MARGIN_X * 2, 19 * FS, 0.56);
      for (const line of lines) {
        parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${19 * FS}" fill="${PALETTE.ink}">${esc(line)}</text>`);
        y += 27 * FS;
      }
      y += 14 * FS;
    } else if (section.kind === "list") {
      for (const item of section.items) {
        const lines = wrapText(item, SVG_W - MARGIN_X * 2 - 28 * FS, 18 * FS, 0.56);
        lines.forEach((line, i) => {
          const prefix = i === 0 ? "•" : "";
          parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${18 * FS}" fill="${PALETTE.brand}">${prefix}</text>`);
          parts.push(`<text x="${MARGIN_X + 22 * FS}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${18 * FS}" fill="${PALETTE.ink}">${esc(line)}</text>`);
          y += 26 * FS;
        });
      }
      y += 14 * FS;
    } else if (section.kind === "columns") {
      const n = section.columns.length;
      const gap = 32 * FS;
      const colW = (SVG_W - MARGIN_X * 2 - gap * (n - 1)) / n;
      let maxColY = y;
      section.columns.forEach((col, ci) => {
        const cx = MARGIN_X + ci * (colW + gap);
        let cy = y;
        for (const hl of wrapText(col.heading, colW, 18 * FS, 0.6)) {
          parts.push(`<text x="${cx}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="${18 * FS}" font-weight="600" fill="${PALETTE.subhead}">${esc(hl)}</text>`);
          cy += 24 * FS;
        }
        cy += 4 * FS;
        for (const item of col.items) {
          const lines = wrapText(item, colW - 20 * FS, 15 * FS, 0.58);
          lines.forEach((line, i) => {
            const prefix = i === 0 ? "•" : "";
            parts.push(`<text x="${cx}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="${15 * FS}" fill="${PALETTE.brand}">${prefix}</text>`);
            parts.push(`<text x="${cx + 16 * FS}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="${15 * FS}" fill="${PALETTE.ink}">${esc(line)}</text>`);
            cy += 22 * FS;
          });
        }
        maxColY = Math.max(maxColY, cy);
      });
      y = maxColY + 14 * FS;
    } else if (section.kind === "chart") {
      const chartW = SVG_W - MARGIN_X * 2;
      const chartH = Math.round(chartW * (280 / 900));
      const chartSvg = buildProgressChartSvg(section.phases, {
        bg: PALETTE.card, ink: PALETTE.ink, inkDim: PALETTE.inkDim, accent: PALETTE.brand, line: PALETTE.line,
      }, { width: chartW, height: chartH, scale: FS });
      parts.push(`<g transform="translate(${MARGIN_X}, ${y})">${chartSvg}</g>`);
      y += chartH + 24 * FS;
    } else if (section.kind === "course-chart") {
      const chartW = SVG_W - MARGIN_X * 2;
      const chartH = Math.round(chartW * (260 / 900));
      const chartSvg = buildCourseProfileChartSvg(section.profile, {
        bg: PALETTE.card, ink: PALETTE.ink, inkDim: PALETTE.inkDim, accent: PALETTE.brand, line: PALETTE.line,
      }, { width: chartW, height: chartH, scale: FS });
      parts.push(`<g transform="translate(${MARGIN_X}, ${y})">${chartSvg}</g>`);
      y += chartH + 24 * FS;
    } else if (section.kind === "phase-cards") {
      // Mirrors app/training-plan/page.js's .phase-card panels (name+weeks
      // header, focus, volume, optional time-estimate, bulleted workouts)
      // rather than the flat one-line-per-phase list used previously.
      const cardPad = 18 * FS;
      const cardGap = 14 * FS;
      const cardW = SVG_W - MARGIN_X * 2;
      const innerW = cardW - cardPad * 2;
      const nameSize = 19 * FS, weeksSize = 14 * FS, focusSize = 16 * FS, volumeSize = 15.5 * FS, timeSize = 14.5 * FS, workoutSize = 15.5 * FS;

      section.phases.forEach((p, idx) => {
        const lines = [];
        let cursor = 0;

        const pushBlock = (text, size, opts = {}) => {
          if (!text) return;
          const wrapped = wrapText(text, opts.maxWidth ?? innerW, size, 0.56);
          wrapped.forEach((line, i) => {
            const marginBefore = i === 0 ? (opts.marginBefore ?? size * 0.6) : size * 0.4;
            const baseline = cursor + marginBefore + size * 0.82;
            lines.push({ text: line, size, baseline, x: opts.x ?? 0, weight: opts.weight || 400, color: opts.color || PALETTE.ink, mono: opts.mono, bullet: opts.bullet && i === 0, maxWidth: opts.maxWidth ?? innerW });
            cursor = baseline + size * 0.3;
          });
        };

        // Header row: name (wrapped to leave room for weeks) + weeks, same baseline as the live page's flex row.
        const weeksEstW = p.weeks ? String(p.weeks).length * weeksSize * 0.62 + 4 : 0;
        const nameMaxW = Math.max(100 * FS, innerW - weeksEstW - 16 * FS);
        const nameLines = wrapText(p.name || "", nameMaxW, nameSize, 0.56);
        nameLines.forEach((nl, i) => {
          const marginBefore = i === 0 ? 0 : nameSize * 0.4;
          const baseline = cursor + marginBefore + nameSize * 0.82;
          lines.push({ text: nl, size: nameSize, baseline, x: 0, weight: 600, color: PALETTE.ink });
          if (i === 0 && p.weeks) {
            lines.push({ text: p.weeks, size: weeksSize, baseline, x: innerW, weight: 500, color: PALETTE.inkDim, anchor: "end", mono: true });
          }
          cursor = baseline + nameSize * 0.3;
        });

        pushBlock(p.focus, focusSize, { marginBefore: 10 * FS, color: PALETTE.inkDim });
        pushBlock(p.volume, volumeSize, { marginBefore: 12 * FS, color: PALETTE.ink });
        pushBlock(p.timeEstimate, timeSize, { marginBefore: 6 * FS, color: PALETTE.inkDim, mono: true });
        (p.workouts || []).forEach((w, wi) => {
          pushBlock(w, workoutSize, { marginBefore: wi === 0 ? 12 * FS : workoutSize * 0.55, x: 20 * FS, maxWidth: innerW - 20 * FS, bullet: true, color: PALETTE.ink });
        });

        const cardH = cardPad * 2 + cursor;
        parts.push(`<rect x="${MARGIN_X}" y="${y}" width="${cardW}" height="${cardH}" rx="${10 * FS}" fill="${PALETTE.card}" stroke="${PALETTE.line}" stroke-width="1"/>`);
        const cardTopY = y + cardPad;
        lines.forEach((ln) => {
          const absX = MARGIN_X + cardPad + ln.x;
          const absY = cardTopY + ln.baseline;
          const anchor = ln.anchor ? ` text-anchor="${ln.anchor}"` : "";
          const family = ln.mono ? "IBM Plex Mono, monospace" : "Space Grotesk, sans-serif";
          if (ln.bullet) {
            parts.push(`<text x="${MARGIN_X + cardPad}" y="${absY}" font-family="Space Grotesk, sans-serif" font-size="${ln.size}" fill="${PALETTE.brand}">•</text>`);
          }
          parts.push(`<text x="${absX}" y="${absY}"${anchor} font-family="${family}" font-size="${ln.size}" font-weight="${ln.weight}" fill="${ln.color}">${esc(ln.text)}</text>`);
        });

        y += cardH;
        if (idx < section.phases.length - 1) y += cardGap;
      });
      y += 14 * FS;
    }
  }

  // Footer — the QR/text lanes both start at the same footerTop and grow
  // independently, so the final height is whichever lane runs longer
  // rather than a fixed offset that could land on top of a tall last
  // section (as a "distance from the bottom" anchor did previously).
  y += 30 * FS;
  parts.push(`<line x1="${MARGIN_X}" y1="${y}" x2="${SVG_W - MARGIN_X}" y2="${y}" stroke="${PALETTE.line}" stroke-width="1"/>`);
  y += 46 * FS;
  const footerTop = y;
  const qrSize = 110 * FS;
  const qrX = SVG_W - MARGIN_X - qrSize;
  parts.push(`<image href="data:image/png;base64,${qrB64}" x="${qrX}" y="${footerTop}" width="${qrSize}" height="${qrSize}"/>`);
  parts.push(`<text x="${qrX + qrSize / 2}" y="${footerTop + qrSize + 24 * FS}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${14 * FS}" fill="${PALETTE.inkDim}">${esc(siteHost())}</text>`);
  const qrBottom = footerTop + qrSize + 24 * FS;

  let leftY = footerTop + 8 * FS;
  const leftMaxWidth = qrX - MARGIN_X - 30 * FS;
  if (model.footerNote) {
    const noteLines = wrapText(model.footerNote, leftMaxWidth, 14 * FS, 0.56);
    noteLines.forEach((line, i) => {
      parts.push(`<text x="${MARGIN_X}" y="${leftY + i * 20 * FS}" font-family="Space Grotesk, sans-serif" font-size="${14 * FS}" fill="${PALETTE.inkDim}">${esc(line)}</text>`);
    });
    leftY += noteLines.length * 20 * FS + 10 * FS;
  }
  const year = new Date().getFullYear();
  const copyrightLines = wrapText(
    `© ${year} Splitline. All analysis and content on this document originate from Splitline and are provided for personal use only.`,
    leftMaxWidth, 14 * FS, 0.56
  );
  copyrightLines.forEach((line, i) => {
    parts.push(`<text x="${MARGIN_X}" y="${leftY + i * 20 * FS}" font-family="Space Grotesk, sans-serif" font-size="${14 * FS}" fill="${PALETTE.inkDim}">${esc(line)}</text>`);
  });
  leftY += copyrightLines.length * 20 * FS;

  const H = Math.round(Math.max(leftY, qrBottom) + 40 * FS);

  return `<svg width="${SVG_W}" height="${H}" viewBox="0 0 ${SVG_W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SVG_W}" height="${H}" fill="${PALETTE.bg}"/>
  ${parts.join("\n  ")}
</svg>`;
}

// ---------- PDF ----------

const PAGE_W = 612, PAGE_H = 792; // US Letter — a fixed physical page size,
// so FS below scales font sizes and inter-line/inter-block spacing (to
// avoid the bigger text overlapping), never the page or margin dimensions
// themselves — pagination just adds more pages for the extra height.
const PDF_MARGIN = 56;
const CONTENT_W = PAGE_W - PDF_MARGIN * 2;

function hexToRgb01(hex) {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

function wrapExact(font, size, text, maxWidth) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildSharePdf(model) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // `subset: true` embeds only the glyphs actually drawn — without it,
  // pdf-lib's bundled fontkit walks every glyph in the font to compute the
  // full embedded program and trips over a glyf-table quirk elsewhere in
  // these TTFs (resvg's rasterizer tolerates it; fontkit's stricter parser
  // doesn't). The PDF's monospace-styled numbers use the standard Courier
  // font instead of IBM Plex Mono, since embedding it hits that same quirk.
  const [bold, medium, regular, mono] = await Promise.all([
    pdf.embedFont(fs.readFileSync(path.join(FONT_DIR, "SpaceGrotesk-Bold.ttf")), { subset: true }),
    pdf.embedFont(fs.readFileSync(path.join(FONT_DIR, "SpaceGrotesk-Medium.ttf")), { subset: true }),
    pdf.embedFont(fs.readFileSync(path.join(FONT_DIR, "SpaceGrotesk-Regular.ttf")), { subset: true }),
    pdf.embedFont(StandardFonts.Courier),
  ]);
  const logoPng = await pdf.embedPng(fs.readFileSync(LOGO_PATH));
  const qrPng = await pdf.embedPng(await qrPngBuffer(SITE_URL, 240));

  const ink = hexToRgb01(PALETTE.ink);
  const inkDim = hexToRgb01(PALETTE.inkDim);
  const brand = hexToRgb01(PALETTE.brand);
  const bg = hexToRgb01(PALETTE.bg);
  const lineCol = rgb(0.85, 0.83, 0.79);

  let page, y;
  let pageNum = 0;

  function drawFooter() {
    const year = new Date().getFullYear();
    page.drawLine({ start: { x: PDF_MARGIN, y: 66 }, end: { x: PAGE_W - PDF_MARGIN, y: 66 }, thickness: 1, color: lineCol });
    const copyright = `© ${year} Splitline. All analysis and content on this document originate from Splitline and are provided for personal use only.`;
    const noteLines = wrapExact(regular, 8 * FS, copyright, CONTENT_W - 90);
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: PDF_MARGIN, y: 50 - i * 11 * FS, size: 8 * FS, font: regular, color: inkDim });
    });
    page.drawImage(qrPng, { x: PAGE_W - PDF_MARGIN - 42, y: 32, width: 42, height: 42 });
    page.drawText(siteHost(), { x: PAGE_W - PDF_MARGIN - 42, y: 22, size: 6 * FS, font: mono, color: inkDim });
  }

  function newPage(withFullHeader) {
    if (page) drawFooter();
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageNum += 1;
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: bg });
    y = PAGE_H - PDF_MARGIN;

    page.drawImage(logoPng, { x: PDF_MARGIN, y: y - 26, width: 26, height: 26 });
    page.drawText("SPLIT", { x: PDF_MARGIN + 34, y: y - 20 * FS, size: 14 * FS, font: bold, color: brand });
    page.drawText("LINE", { x: PDF_MARGIN + 34 + bold.widthOfTextAtSize("SPLIT", 14 * FS), y: y - 20 * FS, size: 14 * FS, font: bold, color: ink });
    const eyebrowW = mono.widthOfTextAtSize(model.eyebrow, 9 * FS);
    page.drawText(model.eyebrow, { x: PAGE_W - PDF_MARGIN - eyebrowW, y: y - 18 * FS, size: 9 * FS, font: mono, color: inkDim });
    y -= 40 * FS;
    page.drawLine({ start: { x: PDF_MARGIN, y }, end: { x: PAGE_W - PDF_MARGIN, y }, thickness: 1, color: lineCol });
    y -= 30 * FS;

    if (withFullHeader) {
      const titleLines = wrapExact(bold, 22 * FS, model.title, CONTENT_W);
      titleLines.forEach((line) => { page.drawText(line, { x: PDF_MARGIN, y, size: 22 * FS, font: bold, color: ink }); y -= 26 * FS; });
      if (model.subtitle) {
        page.drawText(model.subtitle, { x: PDF_MARGIN, y, size: 11 * FS, font: medium, color: inkDim });
        y -= 22 * FS;
      }
      if (model.badge) {
        const bw = bold.widthOfTextAtSize(model.badge.text, 10 * FS) + 24 * FS;
        const rc = hexToRgb01(riskColor(model.badge.level));
        page.drawRectangle({ x: PDF_MARGIN, y: y - 16 * FS, width: bw, height: 20 * FS, color: rc });
        page.drawText(model.badge.text, { x: PDF_MARGIN + 12 * FS, y: y - 10 * FS, size: 10 * FS, font: bold, color: rgb(1, 1, 1) });
        y -= 34 * FS;
      }
      if (model.stats?.length) {
        // Wrap each label to its column width first (mirrors buildShareSvg's
        // stats row) — an unwrapped long label like "Aerobic decoupling
        // (30d)" would otherwise run into the next column.
        const n = model.stats.length;
        const colW = CONTENT_W / n;
        const labelSize = 9 * FS;
        const labelLineH = labelSize * 1.3;
        const statLabelLines = model.stats.map((s) => wrapExact(medium, labelSize, s.label, colW - 8 * FS));
        const maxLabelLines = Math.max(1, ...statLabelLines.map((l) => l.length));
        const valueY = y - maxLabelLines * labelLineH - 6 * FS;
        model.stats.forEach((s, i) => {
          const cx = PDF_MARGIN + i * colW;
          statLabelLines[i].forEach((line, li) => {
            page.drawText(line, { x: cx, y: y - li * labelLineH, size: labelSize, font: medium, color: inkDim });
          });
          page.drawText(s.value, { x: cx, y: valueY, size: 18 * FS, font: mono, color: ink });
        });
        y = valueY - 20 * FS;
      }
    }
  }

  function ensureSpace(needed) {
    if (y - needed < 90) newPage(false);
  }

  newPage(true);

  for (const section of model.sections) {
    ensureSpace(50 * FS);
    y -= 8 * FS;
    page.drawText(section.heading, { x: PDF_MARGIN, y, size: 13 * FS, font: bold, color: ink });
    y -= 20 * FS;

    if (section.kind === "paragraph") {
      for (const line of wrapExact(regular, 10.5 * FS, section.text || "", CONTENT_W)) {
        ensureSpace(16 * FS);
        page.drawText(line, { x: PDF_MARGIN, y, size: 10.5 * FS, font: regular, color: ink });
        y -= 15 * FS;
      }
      y -= 8 * FS;
    } else if (section.kind === "list") {
      for (const item of section.items) {
        const lines = wrapExact(regular, 10 * FS, item, CONTENT_W - 16 * FS);
        lines.forEach((line, i) => {
          ensureSpace(15 * FS);
          if (i === 0) page.drawText("•", { x: PDF_MARGIN, y, size: 10 * FS, font: bold, color: brand });
          page.drawText(line, { x: PDF_MARGIN + 14 * FS, y, size: 10 * FS, font: regular, color: ink });
          y -= 14 * FS;
        });
      }
      y -= 8 * FS;
    } else if (section.kind === "columns") {
      const n = section.columns.length;
      const gap = 16 * FS;
      const colW = (CONTENT_W - gap * (n - 1)) / n;
      // Pre-measure so a tall column can't split mid-block across a page
      // boundary — columns must stay visually aligned side by side.
      const headingLines = section.columns.map((col) => wrapExact(bold, 10 * FS, col.heading, colW));
      const colLines = section.columns.map((col) =>
        col.items.map((item) => wrapExact(regular, 8.5 * FS, item, colW - 10 * FS))
      );
      const tallestLineCount = Math.max(
        0,
        ...colLines.map((lines, ci) => headingLines[ci].length + lines.reduce((n2, l) => n2 + l.length, 0))
      );
      const blockHeight = tallestLineCount * 12 * FS + 12 * FS + 8 * FS;
      if (blockHeight > PAGE_H - PDF_MARGIN - 90) {
        // Block taller than a whole page — nothing to gain by forcing a
        // fresh page, so just let it run (it may spill past the footer).
      } else {
        ensureSpace(blockHeight);
      }
      const startY = y;
      let minY = y;
      section.columns.forEach((col, ci) => {
        const cx = PDF_MARGIN + ci * (colW + gap);
        let cy = startY;
        headingLines[ci].forEach((hl) => {
          page.drawText(hl, { x: cx, y: cy, size: 10 * FS, font: bold, color: brand });
          cy -= 12 * FS;
        });
        cy -= 4 * FS;
        col.items.forEach((item, ii) => {
          colLines[ci][ii].forEach((line, i) => {
            if (i === 0) page.drawText("•", { x: cx, y: cy, size: 8.5 * FS, font: bold, color: brand });
            page.drawText(line, { x: cx + 9 * FS, y: cy, size: 8.5 * FS, font: regular, color: ink });
            cy -= 12 * FS;
          });
        });
        minY = Math.min(minY, cy);
      });
      y = minY - 8 * FS;
    } else if (section.kind === "chart") {
      const renderW = Math.round(CONTENT_W * 2);
      const renderH = Math.round(renderW * (280 / 900));
      const chartSvgStr = buildProgressChartSvg(section.phases, {
        bg: PALETTE.card, ink: PALETTE.ink, inkDim: PALETTE.inkDim, accent: PALETTE.brand, line: PALETTE.line,
      }, { width: renderW, height: renderH, scale: FS });
      const chartPng = await pdf.embedPng(await svgToPng(chartSvgStr));
      const dispH = renderH / 2;
      ensureSpace(dispH + 10 * FS);
      page.drawImage(chartPng, { x: PDF_MARGIN, y: y - dispH, width: CONTENT_W, height: dispH });
      y -= dispH + 10 * FS;
    } else if (section.kind === "course-chart") {
      const renderW = Math.round(CONTENT_W * 2);
      const renderH = Math.round(renderW * (260 / 900));
      const chartSvgStr = buildCourseProfileChartSvg(section.profile, {
        bg: PALETTE.card, ink: PALETTE.ink, inkDim: PALETTE.inkDim, accent: PALETTE.brand, line: PALETTE.line,
      }, { width: renderW, height: renderH, scale: FS });
      const chartPng = await pdf.embedPng(await svgToPng(chartSvgStr));
      const dispH = renderH / 2;
      ensureSpace(dispH + 10 * FS);
      page.drawImage(chartPng, { x: PDF_MARGIN, y: y - dispH, width: CONTENT_W, height: dispH });
      y -= dispH + 10 * FS;
    } else if (section.kind === "phase-cards") {
      const cardPad = 12 * FS;
      const cardGap = 10 * FS;
      const innerW = CONTENT_W - cardPad * 2;
      const nameSize = 12 * FS, weeksSize = 9 * FS, focusSize = 10 * FS, volumeSize = 9.5 * FS, timeSize = 9 * FS, workoutSize = 9.5 * FS;

      for (const p of section.phases) {
        const weeksW = p.weeks ? mono.widthOfTextAtSize(p.weeks, weeksSize) : 0;
        const nameMaxW = Math.max(80 * FS, innerW - weeksW - 12 * FS);
        const nameLines = wrapExact(bold, nameSize, p.name || "", nameMaxW);
        const focusLines = p.focus ? wrapExact(regular, focusSize, p.focus, innerW) : [];
        const volumeLines = p.volume ? wrapExact(regular, volumeSize, p.volume, innerW) : [];
        const timeLines = p.timeEstimate ? wrapExact(mono, timeSize, p.timeEstimate, innerW) : [];
        const workoutLineGroups = (p.workouts || []).map((w) => wrapExact(regular, workoutSize, w, innerW - 12 * FS));

        let contentH = nameLines.length * (nameSize * 1.25);
        if (focusLines.length) contentH += 6 * FS + focusLines.length * (focusSize * 1.3);
        if (volumeLines.length) contentH += 8 * FS + volumeLines.length * (volumeSize * 1.3);
        if (timeLines.length) contentH += 5 * FS + timeLines.length * (timeSize * 1.3);
        workoutLineGroups.forEach((grp, i) => { contentH += (i === 0 ? 10 * FS : workoutSize * 0.6) + grp.length * (workoutSize * 1.35); });
        contentH += 8 * FS; // safety margin against estimation drift

        const cardH = cardPad * 2 + contentH;
        ensureSpace(cardH + cardGap);

        const cardTop = y;
        page.drawRectangle({ x: PDF_MARGIN, y: cardTop - cardH, width: CONTENT_W, height: cardH, borderColor: lineCol, borderWidth: 1, color: bg });

        let cy = cardTop - cardPad - nameSize * 0.85;
        nameLines.forEach((nl, i) => {
          page.drawText(nl, { x: PDF_MARGIN + cardPad, y: cy, size: nameSize, font: bold, color: ink });
          if (i === 0 && p.weeks) {
            page.drawText(p.weeks, { x: PDF_MARGIN + cardPad + innerW - weeksW, y: cy, size: weeksSize, font: mono, color: inkDim });
          }
          cy -= nameSize * 1.25;
        });
        if (focusLines.length) {
          cy -= 6 * FS;
          focusLines.forEach((fl) => { page.drawText(fl, { x: PDF_MARGIN + cardPad, y: cy, size: focusSize, font: regular, color: inkDim }); cy -= focusSize * 1.3; });
        }
        if (volumeLines.length) {
          cy -= 8 * FS;
          volumeLines.forEach((vl) => { page.drawText(vl, { x: PDF_MARGIN + cardPad, y: cy, size: volumeSize, font: regular, color: ink }); cy -= volumeSize * 1.3; });
        }
        if (timeLines.length) {
          cy -= 5 * FS;
          timeLines.forEach((tl) => { page.drawText(tl, { x: PDF_MARGIN + cardPad, y: cy, size: timeSize, font: mono, color: inkDim }); cy -= timeSize * 1.3; });
        }
        workoutLineGroups.forEach((grp, gi) => {
          cy -= gi === 0 ? 10 * FS : workoutSize * 0.6;
          grp.forEach((line, li) => {
            if (li === 0) page.drawText("•", { x: PDF_MARGIN + cardPad, y: cy, size: workoutSize, font: bold, color: brand });
            page.drawText(line, { x: PDF_MARGIN + cardPad + 10 * FS, y: cy, size: workoutSize, font: regular, color: ink });
            cy -= workoutSize * 1.35;
          });
        });

        y = cardTop - cardH - cardGap;
      }
      y -= 4 * FS;
    }
  }

  drawFooter();
  return Buffer.from(await pdf.save());
}
