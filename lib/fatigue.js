// A deterministic fatigue estimate for the telemetry summary's gauge
// meter — how recently the athlete trained, weighted by how hard that
// last effort was relative to their own recent norm, plus a chronic-load
// bump when the acute:chronic ratio (lib/insights.js) is already elevated.
// Not a physiological measurement (no HRV, no resting HR baseline) —
// a duration/intensity/recency heuristic from the athlete's own history.

import { estimateLoad, computeTrainingLoad } from "./insights.js";

const BASE_RECOVERY_HOURS = 72; // full-recovery window assumed for a "typical" effort
const MIN_INTENSITY_MULTIPLIER = 0.6;
const MAX_INTENSITY_MULTIPLIER = 1.8;
const MAX_CHRONIC_BUMP = 30;

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export function computeFatigueScore(activities, now = new Date()) {
  if (!activities.length) {
    return {
      score: 0, zone: "fresh", hoursSinceLastActivity: null,
      lastActivityName: null, lastActivityDate: null,
      note: "No imported activities yet.",
    };
  }

  const sorted = [...activities].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  const last = sorted[0];
  const lastEnd = new Date(new Date(last.startDate).getTime() + (last.movingMin || 0) * 60000);
  const hoursSince = Math.max(0, (now - lastEnd) / (1000 * 60 * 60));

  const lastLoad = estimateLoad(last);
  const otherLoads = activities.filter((a) => a !== last).map(estimateLoad);
  const avgOtherLoad = avg(otherLoads) || lastLoad || 1;
  const intensityMultiplier = Math.min(
    MAX_INTENSITY_MULTIPLIER,
    Math.max(MIN_INTENSITY_MULTIPLIER, avgOtherLoad > 0 ? lastLoad / avgOtherLoad : 1)
  );
  const effectiveWindowHours = BASE_RECOVERY_HOURS * intensityMultiplier;
  const recencyFatigue = Math.max(0, Math.min(100, 100 * (1 - hoursSince / effectiveWindowHours)));

  const { acwr } = computeTrainingLoad(activities, now);
  const chronicBump = acwr != null ? Math.max(0, Math.min(MAX_CHRONIC_BUMP, (acwr - 1) * 40)) : 0;

  const score = Math.round(Math.max(0, Math.min(100, recencyFatigue * 0.75 + chronicBump)));
  const zone = score >= 67 ? "fatigued" : score >= 34 ? "moderate" : "fresh";

  return {
    score,
    zone,
    hoursSinceLastActivity: Math.round(hoursSince * 10) / 10,
    lastActivityName: last.name,
    lastActivityDate: last.startDate,
    note: "A duration/intensity/recency heuristic from your own training history, not a physiological fatigue measurement.",
  };
}
