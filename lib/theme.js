// Single source of truth for the app's two color themes — mirrors the
// CSS custom properties in app/globals.css exactly. Used wherever colors
// are needed outside CSS: the inline training-progress chart and the
// satori-rendered export cards (lib/insightCard.js).

export const THEMES = {
  dark: {
    bg: "#0E1420", bgRaised: "#161D2C", line: "#2A3347",
    ink: "#ECE7DA", inkDim: "#8B93A6",
    amber: "#EFA33B", teal: "#4C9C93", coral: "#D2604B",
  },
  light: {
    bg: "#F3EEE2", bgRaised: "#FCFAF4", line: "rgba(23,21,18,0.16)",
    ink: "#171512", inkDim: "#6B6558",
    amber: "#C97B2E", teal: "#2E6B65", coral: "#B8503D",
  },
};

export function resolveTheme(theme) {
  return THEMES[theme] === undefined ? THEMES.dark : THEMES[theme];
}
