// Shared, theme-agnostic formatting for the telemetry summary — consumed
// by both the on-page HTML panel (components/TelemetryPanel.js) and the
// exported-image SVG builder (lib/telemetrySummarySvg.js), so a pace
// string or a tile list can't drift between what's on screen and what
// gets saved as an image.

import { fmtHMS } from "./svg.js";

export const ZONE_LABEL = { fresh: "Fresh", moderate: "Moderate fatigue", fatigued: "Fatigued — prioritize recovery" };

// Splitline's own plain-language read of Oura's 0-100 readiness score —
// not Oura's own official banding (which varies its exact wording by
// score type), just simple, round-number bands so the number means
// something at a glance next to the fatigue gauge's own zone label.
function readinessLabel(score) {
  if (score == null) return null;
  if (score >= 70) return "Well recovered";
  if (score >= 50) return "Adequate recovery";
  return "Recovery lagging";
}

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

  // Recovery side, only populated when an Oura Ring is connected —
  // deliberately kept as its own tiles/trace pair rather than merged
  // into the training ones above, so "progress" (training intensity)
  // and "recovery" (readiness) read as two clearly separate, comparable
  // stories rather than one chart trying to say two things on two axes.
  const sr = summary.sleepRecovery;
  const recoveryTiles = [];
  if (sr?.avgHrvMs != null) recoveryTiles.push({ label: "Avg HRV (7d)", value: sr.avgHrvMs.toString(), unit: "ms" });
  if (sr?.avgRestingHrBpm != null) recoveryTiles.push({ label: "Resting HR (7d)", value: Math.round(sr.avgRestingHrBpm).toString(), unit: "bpm" });
  if (sr?.avgReadinessScore != null) recoveryTiles.push({ label: "Readiness (7d avg)", value: sr.avgReadinessScore.toString(), unit: "/100" });
  if (sr?.avgTotalSleepMin != null) {
    const h = Math.floor(sr.avgTotalSleepMin / 60), m = Math.round(sr.avgTotalSleepMin % 60);
    recoveryTiles.push({ label: "Avg sleep (7d)", value: `${h}:${String(m).padStart(2, "0")}`, unit: "h" });
  }

  const recoveryTrace = (summary.recoverySeries || []).map((p) => p.value);
  const hasRecoveryTrend = recoveryTrace.length >= 2;

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
    ouraConnected: Boolean(sr),
    recoveryTiles: recoveryTiles.slice(0, 4),
    hasRecoveryTrend,
    recoveryTrace,
    readinessLabel: readinessLabel(sr?.avgReadinessScore),
    underRecoveryFlag: Boolean(sr?.underRecoveryFlag),
    hrvTrendPct: sr?.hrvTrendPct ?? null,
    restingHrTrendPct: sr?.restingHrTrendPct ?? null,
    movingTimeStr: fmtHMS(summary.totalMovingMin),
  };
}
