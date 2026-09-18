// Shared, theme-agnostic formatting for the telemetry summary — consumed
// by both the on-page HTML panel (components/TelemetryPanel.js) and the
// exported-image SVG builder (lib/telemetrySummarySvg.js), so a pace
// string or a tile list can't drift between what's on screen and what
// gets saved as an image.

import { fmtHMS } from "./svg.js";

export const ZONE_LABEL = { fresh: "Fresh", moderate: "Moderate fatigue", fatigued: "Fatigued — prioritize recovery" };

export function paceStr(minPerKm) {
  if (minPerKm == null) return null;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function prepareTelemetryDisplay(summary, units = "metric") {
  const mi = units === "imperial";
  const totalHours = summary.totalMovingMin / 60;
  const totalHoursStr = totalHours >= 10 ? totalHours.toFixed(0) : totalHours.toFixed(1);

  const periodFrom = new Date(summary.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const periodTo = new Date(summary.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const tiles = [];
  if (summary.avgHr != null) tiles.push({ label: "Avg heart rate", value: summary.avgHr.toString(), unit: "bpm" });
  if (summary.avgWatts != null) tiles.push({ label: "Avg power", value: summary.avgWatts.toString(), unit: "W" });
  if (summary.avgPaceMinPerKm != null) {
    const pace = mi ? summary.avgPaceMinPerKm * 1.60934 : summary.avgPaceMinPerKm;
    tiles.push({ label: "Avg pace", value: paceStr(pace), unit: mi ? "/mi" : "/km" });
  }
  if (summary.avgTempC != null) {
    const tempVal = mi ? Math.round((summary.avgTempC * 9) / 5 + 32) : Math.round(summary.avgTempC);
    tiles.push({ label: "Avg recorded temp", value: tempVal.toString(), unit: mi ? "°F" : "°C" });
  }

  // tracePath (lib/svg.js) divides by (length - 1), undefined for one point.
  const trace = summary.loadSeries.map((p) => p.load);
  const hasTrend = trace.length >= 2;

  return {
    totalHoursStr,
    periodFrom,
    periodTo,
    sampleSize: summary.sampleSize,
    periodDays: summary.periodDays,
    acwr: summary.acwr,
    tiles: tiles.slice(0, 4),
    hasTrend,
    trace,
    fatigueScore: summary.fatigue.score || 0,
    zoneKey: summary.fatigue.zone,
    zoneLabel: ZONE_LABEL[summary.fatigue.zone] || "",
    hoursSinceLastActivity: summary.fatigue.hoursSinceLastActivity,
    movingTimeStr: fmtHMS(summary.totalMovingMin),
  };
}
