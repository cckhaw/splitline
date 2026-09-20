// Aggregates the athlete's last-30-activities into the stats bundle the
// telemetry summary infographic renders — one card instead of one per
// activity. All numbers are computed here from stored activity rows;
// nothing is fetched live.

import { estimateLoad, computeTrainingLoad } from "./insights.js";
import { computeFatigueScore } from "./fatigue.js";
import { summarizeSleepRecovery } from "./sleepRecovery.js";

function avg(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

// `sleepMetrics` is optional — lib/db.js's getOuraMetricsForUser output
// when the athlete has connected an Oura Ring, already scoped to this
// same activity period by the caller, so every night in it is one point
// on the recovery trend below. Omitted (or empty) when there's no
// connection, in which case the panel just doesn't show a recovery side.
export function buildTelemetrySummary(activities, now = new Date(), sleepMetrics = null) {
  if (!activities.length) {
    return { sampleSize: 0, fatigue: computeFatigueScore(activities, now), sleepRecovery: summarizeSleepRecovery(sleepMetrics, now) };
  }

  const sorted = [...activities].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const periodStart = sorted[0].startDate;
  const periodEnd = sorted[sorted.length - 1].startDate;
  const periodDays = Math.max(1, Math.round((new Date(periodEnd) - new Date(periodStart)) / 86400000));

  const totalMovingMin = Math.round(activities.reduce((s, a) => s + (a.movingMin || 0), 0));

  const avgHr = avg(activities.map((a) => a.avgHr));
  const avgWatts = avg(activities.map((a) => a.avgWatts));
  const runs = activities.filter((a) => /run/i.test(a.sport || "") && a.avgSpeedKmh > 0);
  const avgPaceMinPerKm = runs.length ? avg(runs.map((a) => 60 / a.avgSpeedKmh)) : null;

  const temps = activities.map((a) => a.avgTempC).filter((t) => t != null);
  const avgTempC = temps.length ? avg(temps) : null;

  // Chronological per-activity load, for the intensity trend chart —
  // same duration×intensity heuristic the training-load panel uses, so
  // the two readings on the dashboard can't tell visually different stories.
  const loadSeries = sorted.map((a) => ({
    date: a.startDate,
    load: Math.round(estimateLoad(a) * 10) / 10,
    name: a.name,
  }));

  const { acwr } = computeTrainingLoad(activities, now);
  const sleepRecovery = summarizeSleepRecovery(sleepMetrics, now);

  // One point per night across the same period the intensity trend
  // covers — readiness score first (Oura's own "how ready to perform
  // today" number, the most athlete-legible single figure it publishes),
  // falling back to the sleep score for a night that has one but not
  // the other yet (e.g. the day a ring was first connected).
  const recoverySeries = sleepRecovery
    ? sleepRecovery.dailySeries
        .map((d) => ({ date: d.day, value: d.readinessScore ?? d.sleepScore ?? null }))
        .filter((d) => d.value != null)
    : [];

  return {
    sampleSize: activities.length,
    periodStart,
    periodEnd,
    periodDays,
    totalMovingMin,
    avgHr: avgHr != null ? Math.round(avgHr) : null,
    avgWatts: avgWatts != null ? Math.round(avgWatts) : null,
    avgPaceMinPerKm,
    avgTempC: avgTempC != null ? Math.round(avgTempC * 10) / 10 : null,
    tempSampleSize: temps.length,
    loadSeries,
    acwr,
    fatigue: computeFatigueScore(activities, now),
    sleepRecovery,
    recoverySeries,
  };
}
