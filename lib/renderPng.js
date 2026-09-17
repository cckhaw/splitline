// Rasterizes a generated SVG card (activity overlay or insight card) to
// PNG. Bundles the app's own type families as real font files rather
// than relying on `loadSystemFonts` — Vercel's serverless runtime ships
// no system fonts at all, so without this, @resvg/resvg-js finds no
// match for "Space Grotesk, sans-serif" / "IBM Plex Mono, monospace" and
// silently renders every text element as invisible, leaving only the
// background rect (the "blank card" bug). Both families are Google
// Fonts under the SIL Open Font License, bundled here for exactly this.

import path from "node:path";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const FONT_FILES = [
  "SpaceGrotesk-Regular.ttf",
  "SpaceGrotesk-Medium.ttf",
  "SpaceGrotesk-Bold.ttf",
  "IBMPlexMono-Regular.ttf",
  "IBMPlexMono-Medium.ttf",
  "IBMPlexMono-SemiBold.ttf",
].map((f) => path.join(FONT_DIR, f));

export async function svgToPng(svg) {
  const { Resvg } = await import("@resvg/resvg-js");
  const png = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: FONT_FILES,
      defaultFontFamily: "Space Grotesk",
    },
  }).render();
  return png.asPng();
}
