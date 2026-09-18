// Single source of truth for the app's two color themes — mirrors the
// CSS custom properties in app/globals.css exactly. Used wherever colors
// are needed outside CSS: the inline training-progress chart and the
// satori-rendered export cards (lib/insightCard.js).

export const THEMES = {
  light: {
    bg: "#F3EEE2", bgRaised: "#FCFAF4", line: "rgba(23,21,18,0.16)",
    ink: "#171512", inkDim: "#6B6558",
    brand: "#FD6130", brand2: "#0DBBED",
    amber: "#F59E0B", teal: "#0D9488", coral: "#E11D48",
  },
  dark: {
    bg: "#0E1420", bgRaised: "#161D2C", line: "#2A3347",
    ink: "#ECE7DA", inkDim: "#8B93A6",
    brand: "#FF7A4D", brand2: "#3FCBF0",
    amber: "#A16207", teal: "#0D9488", coral: "#F43F5E",
  },
};

export function resolveTheme(theme) {
  return THEMES[theme] === undefined ? THEMES.light : THEMES[theme];
}
