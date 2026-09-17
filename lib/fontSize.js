// Shared constants for the display font-size control (hamburger menu).
// Kept out of components/UserMenu.js so app/layout.js's pre-paint init
// script and the menu's +/- buttons can't drift out of sync.

export const FONT_SIZE_STORAGE_KEY = "splitline_font_scale";
export const FONT_SIZE_MIN = 0.8;
export const FONT_SIZE_MAX = 1.4;
export const FONT_SIZE_STEP = 0.1;
export const FONT_SIZE_DEFAULT = 1;

export function clampFontScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n * 100) / 100));
}
