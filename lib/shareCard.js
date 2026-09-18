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

const SVG_W = 1080;
const MARGIN_X = 84;

export async function buildShareSvg(model) {
  const logoB64 = fs.readFileSync(LOGO_PATH).toString("base64");
  const qrB64 = (await qrPngBuffer(SITE_URL, 220)).toString("base64");

  let y = 74;
  const parts = [];

  // Header: logo + wordmark
  parts.push(`<image href="data:image/png;base64,${logoB64}" x="${MARGIN_X}" y="${y - 40}" width="52" height="52"/>`);
  parts.push(`<text x="${MARGIN_X + 66}" y="${y - 6}" font-family="Space Grotesk, sans-serif" font-size="28" font-weight="700" fill="${PALETTE.brand}">SPLIT<tspan fill="${PALETTE.ink}">LINE</tspan></text>`);
  parts.push(`<text x="${SVG_W - MARGIN_X}" y="${y - 6}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="18" font-weight="500" fill="${PALETTE.inkDim}">${esc(model.eyebrow)}</text>`);
  y += 40;
  parts.push(`<line x1="${MARGIN_X}" y1="${y}" x2="${SVG_W - MARGIN_X}" y2="${y}" stroke="${PALETTE.line}" stroke-width="1"/>`);
  y += 56;

  // Title + subtitle
  parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="42" font-weight="700" fill="${PALETTE.ink}">${esc(model.title)}</text>`);
  y += 30;
  if (model.subtitle) {
    parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="20" font-weight="500" fill="${PALETTE.inkDim}">${esc(model.subtitle)}</text>`);
    y += 30;
  }

  // Badge
  if (model.badge) {
    const bw = model.badge.text.length * 12 + 48;
    parts.push(`<rect x="${MARGIN_X}" y="${y}" width="${bw}" height="40" rx="20" fill="${riskColor(model.badge.level)}"/>`);
    parts.push(`<text x="${MARGIN_X + bw / 2}" y="${y + 26}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="18" font-weight="600" fill="#FFFFFF">${esc(model.badge.text)}</text>`);
    y += 66;
  }

  // Stats row
  if (model.stats?.length) {
    const n = model.stats.length;
    const colW = (SVG_W - MARGIN_X * 2) / n;
    model.stats.forEach((s, i) => {
      const cx = MARGIN_X + i * colW;
      parts.push(`<text x="${cx}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="17" font-weight="500" fill="${PALETTE.inkDim}">${esc(s.label)}</text>`);
      parts.push(`<text x="${cx}" y="${y + 38}" font-family="IBM Plex Mono, monospace" font-size="36" font-weight="600" fill="${PALETTE.ink}">${esc(s.value)}</text>`);
    });
    y += 82;
  }

  // Sections
  for (const section of model.sections) {
    y += 12;
    parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="24" font-weight="700" fill="${PALETTE.ink}">${esc(section.heading)}</text>`);
    y += 34;

    if (section.kind === "paragraph") {
      const lines = wrapText(section.text || "", SVG_W - MARGIN_X * 2, 19, 0.5);
      for (const line of lines) {
        parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="19" fill="${PALETTE.ink}">${esc(line)}</text>`);
        y += 27;
      }
      y += 14;
    } else if (section.kind === "list") {
      for (const item of section.items) {
        const lines = wrapText(item, SVG_W - MARGIN_X * 2 - 28, 18, 0.5);
        lines.forEach((line, i) => {
          const prefix = i === 0 ? "•" : "";
          parts.push(`<text x="${MARGIN_X}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="18" fill="${PALETTE.brand}">${prefix}</text>`);
          parts.push(`<text x="${MARGIN_X + 22}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="18" fill="${PALETTE.ink}">${esc(line)}</text>`);
          y += 26;
        });
      }
      y += 14;
    } else if (section.kind === "columns") {
      const n = section.columns.length;
      const gap = 32;
      const colW = (SVG_W - MARGIN_X * 2 - gap * (n - 1)) / n;
      let maxColY = y;
      section.columns.forEach((col, ci) => {
        const cx = MARGIN_X + ci * (colW + gap);
        let cy = y;
        for (const hl of wrapText(col.heading, colW, 18, 0.55)) {
          parts.push(`<text x="${cx}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="18" font-weight="600" fill="${PALETTE.subhead}">${esc(hl)}</text>`);
          cy += 24;
        }
        cy += 4;
        for (const item of col.items) {
          const lines = wrapText(item, colW - 20, 15, 0.52);
          lines.forEach((line, i) => {
            const prefix = i === 0 ? "•" : "";
            parts.push(`<text x="${cx}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="15" fill="${PALETTE.brand}">${prefix}</text>`);
            parts.push(`<text x="${cx + 16}" y="${cy}" font-family="Space Grotesk, sans-serif" font-size="15" fill="${PALETTE.ink}">${esc(line)}</text>`);
            cy += 22;
          });
        }
        maxColY = Math.max(maxColY, cy);
      });
      y = maxColY + 14;
    }
  }

  // Footer — the QR/text lanes both start at the same footerTop and grow
  // independently, so the final height is whichever lane runs longer
  // rather than a fixed offset that could land on top of a tall last
  // section (as a "distance from the bottom" anchor did previously).
  y += 30;
  parts.push(`<line x1="${MARGIN_X}" y1="${y}" x2="${SVG_W - MARGIN_X}" y2="${y}" stroke="${PALETTE.line}" stroke-width="1"/>`);
  y += 46;
  const footerTop = y;
  const qrSize = 110;
  const qrX = SVG_W - MARGIN_X - qrSize;
  parts.push(`<image href="data:image/png;base64,${qrB64}" x="${qrX}" y="${footerTop}" width="${qrSize}" height="${qrSize}"/>`);
  parts.push(`<text x="${qrX + qrSize / 2}" y="${footerTop + qrSize + 24}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="14" fill="${PALETTE.inkDim}">${esc(siteHost())}</text>`);
  const qrBottom = footerTop + qrSize + 24;

  let leftY = footerTop + 8;
  const leftMaxWidth = qrX - MARGIN_X - 30;
  if (model.footerNote) {
    const noteLines = wrapText(model.footerNote, leftMaxWidth, 14, 0.5);
    noteLines.forEach((line, i) => {
      parts.push(`<text x="${MARGIN_X}" y="${leftY + i * 20}" font-family="Space Grotesk, sans-serif" font-size="14" fill="${PALETTE.inkDim}">${esc(line)}</text>`);
    });
    leftY += noteLines.length * 20 + 10;
  }
  const year = new Date().getFullYear();
  const copyrightLines = wrapText(
    `© ${year} Splitline. All analysis and content on this document originate from Splitline and are provided for personal use only.`,
    leftMaxWidth, 14, 0.5
  );
  copyrightLines.forEach((line, i) => {
    parts.push(`<text x="${MARGIN_X}" y="${leftY + i * 20}" font-family="Space Grotesk, sans-serif" font-size="14" fill="${PALETTE.inkDim}">${esc(line)}</text>`);
  });
  leftY += copyrightLines.length * 20;

  const H = Math.round(Math.max(leftY, qrBottom) + 40);

  return `<svg width="${SVG_W}" height="${H}" viewBox="0 0 ${SVG_W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SVG_W}" height="${H}" fill="${PALETTE.bg}"/>
  ${parts.join("\n  ")}
</svg>`;
}

// ---------- PDF ----------

const PAGE_W = 612, PAGE_H = 792; // US Letter
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
    const noteLines = wrapExact(regular, 8, copyright, CONTENT_W - 90);
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: PDF_MARGIN, y: 50 - i * 11, size: 8, font: regular, color: inkDim });
    });
    page.drawImage(qrPng, { x: PAGE_W - PDF_MARGIN - 42, y: 32, width: 42, height: 42 });
    page.drawText(siteHost(), { x: PAGE_W - PDF_MARGIN - 42, y: 22, size: 6, font: mono, color: inkDim });
  }

  function newPage(withFullHeader) {
    if (page) drawFooter();
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageNum += 1;
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: bg });
    y = PAGE_H - PDF_MARGIN;

    page.drawImage(logoPng, { x: PDF_MARGIN, y: y - 26, width: 26, height: 26 });
    page.drawText("SPLIT", { x: PDF_MARGIN + 34, y: y - 20, size: 14, font: bold, color: brand });
    page.drawText("LINE", { x: PDF_MARGIN + 34 + bold.widthOfTextAtSize("SPLIT", 14), y: y - 20, size: 14, font: bold, color: ink });
    const eyebrowW = mono.widthOfTextAtSize(model.eyebrow, 9);
    page.drawText(model.eyebrow, { x: PAGE_W - PDF_MARGIN - eyebrowW, y: y - 18, size: 9, font: mono, color: inkDim });
    y -= 40;
    page.drawLine({ start: { x: PDF_MARGIN, y }, end: { x: PAGE_W - PDF_MARGIN, y }, thickness: 1, color: lineCol });
    y -= 30;

    if (withFullHeader) {
      const titleLines = wrapExact(bold, 22, model.title, CONTENT_W);
      titleLines.forEach((line) => { page.drawText(line, { x: PDF_MARGIN, y, size: 22, font: bold, color: ink }); y -= 26; });
      if (model.subtitle) {
        page.drawText(model.subtitle, { x: PDF_MARGIN, y, size: 11, font: medium, color: inkDim });
        y -= 22;
      }
      if (model.badge) {
        const bw = bold.widthOfTextAtSize(model.badge.text, 10) + 24;
        const rc = hexToRgb01(riskColor(model.badge.level));
        page.drawRectangle({ x: PDF_MARGIN, y: y - 16, width: bw, height: 20, color: rc });
        page.drawText(model.badge.text, { x: PDF_MARGIN + 12, y: y - 10, size: 10, font: bold, color: rgb(1, 1, 1) });
        y -= 34;
      }
      if (model.stats?.length) {
        const n = model.stats.length;
        const colW = CONTENT_W / n;
        model.stats.forEach((s, i) => {
          const cx = PDF_MARGIN + i * colW;
          page.drawText(s.label, { x: cx, y, size: 9, font: medium, color: inkDim });
          page.drawText(s.value, { x: cx, y: y - 20, size: 18, font: mono, color: ink });
        });
        y -= 40;
      }
    }
  }

  function ensureSpace(needed) {
    if (y - needed < 90) newPage(false);
  }

  newPage(true);

  for (const section of model.sections) {
    ensureSpace(50);
    y -= 8;
    page.drawText(section.heading, { x: PDF_MARGIN, y, size: 13, font: bold, color: ink });
    y -= 20;

    if (section.kind === "paragraph") {
      for (const line of wrapExact(regular, 10.5, section.text || "", CONTENT_W)) {
        ensureSpace(16);
        page.drawText(line, { x: PDF_MARGIN, y, size: 10.5, font: regular, color: ink });
        y -= 15;
      }
      y -= 8;
    } else if (section.kind === "list") {
      for (const item of section.items) {
        const lines = wrapExact(regular, 10, item, CONTENT_W - 16);
        lines.forEach((line, i) => {
          ensureSpace(15);
          if (i === 0) page.drawText("•", { x: PDF_MARGIN, y, size: 10, font: bold, color: brand });
          page.drawText(line, { x: PDF_MARGIN + 14, y, size: 10, font: regular, color: ink });
          y -= 14;
        });
      }
      y -= 8;
    } else if (section.kind === "columns") {
      const n = section.columns.length;
      const gap = 16;
      const colW = (CONTENT_W - gap * (n - 1)) / n;
      // Pre-measure so a tall column can't split mid-block across a page
      // boundary — columns must stay visually aligned side by side.
      const headingLines = section.columns.map((col) => wrapExact(bold, 10, col.heading, colW));
      const colLines = section.columns.map((col) =>
        col.items.map((item) => wrapExact(regular, 8.5, item, colW - 10))
      );
      const tallestLineCount = Math.max(
        0,
        ...colLines.map((lines, ci) => headingLines[ci].length + lines.reduce((n2, l) => n2 + l.length, 0))
      );
      const blockHeight = tallestLineCount * 12 + 12 + 8;
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
          page.drawText(hl, { x: cx, y: cy, size: 10, font: bold, color: brand });
          cy -= 12;
        });
        cy -= 4;
        col.items.forEach((item, ii) => {
          colLines[ci][ii].forEach((line, i) => {
            if (i === 0) page.drawText("•", { x: cx, y: cy, size: 8.5, font: bold, color: brand });
            page.drawText(line, { x: cx + 9, y: cy, size: 8.5, font: regular, color: ink });
            cy -= 12;
          });
        });
        minY = Math.min(minY, cy);
      });
      y = minY - 8;
    }
  }

  drawFooter();
  return Buffer.from(await pdf.save());
}
