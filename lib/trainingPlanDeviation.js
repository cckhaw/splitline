// Deterministic half of the training-plan deviation check: buckets the
// activities imported since a training plan was generated into calendar
// weeks counted from the plan's own start date (week 1 = the first 7
// days after generation), so the AI comparison in lib/anthropic.js's
// generateTrainingPlanDeviation gets clean per-week actuals to line up
// against the plan's phase week-ranges ("Weeks 1-4", etc.) instead of
// having to do that arithmetic itself.

import { estimateLoad } from "./insights.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WEEKS = 104; // 2 years — a sane ceiling against a bad generated_at

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

// `activities` should already be filtered to those on/after
// `planGeneratedAt` — this only buckets, it doesn't filter by date range
// itself, so a caller can't accidentally include pre-plan history.
export function buildWeeklyActuals(activities, planGeneratedAt, now = new Date()) {
  const start = new Date(planGeneratedAt).getTime();
  const buckets = [];
  for (let w = 1; w <= MAX_WEEKS; w++) {
    const bucketStart = start + (w - 1) * WEEK_MS;
    if (bucketStart > now.getTime()) break;
    const bucketEnd = start + w * WEEK_MS;

    const inWeek = activities.filter((a) => {
      const t = new Date(a.startDate).getTime();
      return t >= bucketStart && t < bucketEnd;
    });

    const distanceKm = Math.round(inWeek.reduce((s, a) => s + (a.distanceKm || 0), 0) * 10) / 10;
    const movingMin = Math.round(inWeek.reduce((s, a) => s + (a.movingMin || 0), 0));
    const avgHr = avg(inWeek.filter((a) => a.avgHr).map((a) => a.avgHr));
    const avgWatts = avg(inWeek.filter((a) => a.avgWatts).map((a) => a.avgWatts));
    const estimatedLoad = Math.round(inWeek.reduce((s, a) => s + estimateLoad(a), 0));

    buckets.push({
      weekNumber: w,
      startDate: new Date(bucketStart).toISOString().slice(0, 10),
      endDate: new Date(bucketEnd - 86400000).toISOString().slice(0, 10),
      isPartial: bucketEnd > now.getTime(),
      sessions: inWeek.length,
      distanceKm,
      movingMin,
      avgPaceMinPerKm: distanceKm > 0 ? Math.round((movingMin / distanceKm) * 100) / 100 : null,
      avgHr: avgHr != null ? Math.round(avgHr) : null,
      avgWatts: avgWatts != null ? Math.round(avgWatts) : null,
      estimatedLoad,
    });
  }
  return buckets;
}
