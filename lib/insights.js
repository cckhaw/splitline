// Training-load and race-pace estimates computed from the athlete's own
// imported activities. These are informational heuristics from sports
// science, not a coaching plan or medical guidance — see the caveats
// baked into the returned `status`/`note` strings, which the UI should
// surface as-is rather than dropping.

import { summarizeBiomechanics } from "./biomechanics.js";

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;

// A duration-weighted intensity proxy — real TRIMP needs resting/max HR
// we don't have, so this is deliberately a rough stand-in, preferring
// heart rate, then power, then pace, in that order of how well each
// tracks physiological effort. Exported for lib/fatigue.js and
// lib/telemetrySummary.js, which both need the exact same per-activity
// number this module already uses for training load.
export function estimateLoad(a) {
  const minutes = a.movingMin || 0;
  if (a.avgHr) return minutes * (a.avgHr / 100);
  if (a.avgWatts) return minutes * (a.avgWatts / 200);
  if (a.avgSpeedKmh) return minutes * (a.avgSpeedKmh / 10);
  return minutes * 0.5;
}

function daysAgo(date, now) {
  return (now - new Date(date)) / (1000 * 60 * 60 * 24);
}
function sum(arr) {
  return arr.reduce((s, v) => s + v, 0);
}

export function computeTrainingLoad(activities, now = new Date()) {
  if (!activities.length) {
    return { acuteDaily: 0, chronicDaily: 0, acwr: null, status: "Not enough imported activities yet", note: null };
  }
  const withLoad = activities.map((a) => ({ load: estimateLoad(a), age: daysAgo(a.startDate, now) }));
  const acute = withLoad.filter((a) => a.age <= ACUTE_WINDOW_DAYS);
  const chronic = withLoad.filter((a) => a.age <= CHRONIC_WINDOW_DAYS);
  const acuteDaily = sum(acute.map((a) => a.load)) / ACUTE_WINDOW_DAYS;
  const chronicDaily = sum(chronic.map((a) => a.load)) / CHRONIC_WINDOW_DAYS;
  const acwr = chronicDaily > 0 ? acuteDaily / chronicDaily : null;

  let status = "Not enough history for a stable read";
  if (acwr != null) {
    if (acwr < 0.8) status = "Tapering — recent load is well below your usual base";
    else if (acwr <= 1.3) status = "Sustainable — this week tracks your recent average";
    else if (acwr <= 1.5) status = "Ramping fast — worth watching how you're recovering";
    else status = "Sharp spike — a commonly-cited injury-risk range for a sudden jump";
  }
  return {
    acuteDaily: Math.round(acuteDaily * 10) / 10,
    chronicDaily: Math.round(chronicDaily * 10) / 10,
    acwr: acwr != null ? Math.round(acwr * 100) / 100 : null,
    status,
    note: "A duration/intensity heuristic from your own history, not a medical or coaching assessment — thresholds here follow commonly cited (and debated) sports-science rules of thumb.",
  };
}

// Riegel's formula: T2 = T1 * (D2/D1)^1.06 — a widely used, still
// approximate, race-time predictor from one recent sustained effort.
export function predictRacePaces(activities) {
  const runs = activities.filter((a) => /run/i.test(a.sport || "") && a.movingMin >= 12 && a.distanceKm > 0.5);
  if (!runs.length) return null;

  const best = runs.reduce((b, a) => (!b || a.avgSpeedKmh > b.avgSpeedKmh ? a : b), null);
  const T1 = best.movingMin * 60;
  const D1 = best.distanceKm;

  const targets = [
    { label: "5K", km: 5 },
    { label: "10K", km: 10 },
    { label: "Half marathon", km: 21.0975 },
    { label: "Marathon", km: 42.195 },
  ];
  const predictions = targets.map((t) => ({
    label: t.label,
    km: t.km,
    seconds: Math.round(T1 * Math.pow(t.km / D1, 1.06)),
  }));

  return {
    referenceActivity: { name: best.name, distanceKm: Math.round(D1 * 100) / 100, movingMin: Math.round(best.movingMin) },
    predictions,
    note: "Projected with Riegel's formula from your fastest sustained recent run — a well-known estimate, not a guarantee; taper, terrain, and weather all move the real result.",
  };
}

export function ageFromBirthDate(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  let age = now.getFullYear() - b.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Builds the compact, aggregated-only stats bundle sent to the LLM for
// injury-risk / recovery / nutrition analysis — never raw activity rows,
// and never anything beyond what's already computed for the dashboard.
// `user` may carry a self-reported `birthDate` (Strava's public API does
// not expose date of birth, so there is no way to pull age from Strava
// directly — see README).
export function buildActivitySummary(activities, user = {}, now = new Date()) {
  const age = ageFromBirthDate(user.birthDate, now);
  const load = computeTrainingLoad(activities, now);
  const biomechanics = summarizeBiomechanics(activities, now);

  if (!activities.length) {
    return { sampleSize: 0, ageYears: age, ageSource: age != null ? "self_reported" : "unavailable", trainingLoad: load, biomechanics };
  }

  const sorted = [...activities].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const activeDays = new Set(sorted.map((a) => new Date(a.startDate).toISOString().slice(0, 10)));

  const last7 = activities.filter((a) => daysAgo(a.startDate, now) <= 7);
  const prior21 = activities.filter((a) => { const d = daysAgo(a.startDate, now); return d > 7 && d <= 28; });

  const weeklyDistance = {};
  const sportMix = {};
  let totalElevationGainM = 0;
  let longest = null;
  for (const a of activities) {
    const wk = isoWeekKey(new Date(a.startDate));
    weeklyDistance[wk] = Math.round(((weeklyDistance[wk] || 0) + (a.distanceKm || 0)) * 10) / 10;
    sportMix[a.sport || "Other"] = (sportMix[a.sport || "Other"] || 0) + 1;
    totalElevationGainM += a.elevationGainM || 0;
    if (!longest || (a.distanceKm || 0) > (longest.distanceKm || 0)) longest = a;
  }

  const restDaysLast14 = 14 - new Set(
    activities.filter((a) => daysAgo(a.startDate, now) <= 14).map((a) => new Date(a.startDate).toISOString().slice(0, 10))
  ).size;

  let longestStreak = 0, currentStreak = 0;
  const sortedDays = [...activeDays].sort();
  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0 || (new Date(sortedDays[i]) - new Date(sortedDays[i - 1])) / 86400000 === 1) currentStreak++;
    else currentStreak = 1;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  const avg = (arr) => (arr.length ? Math.round((sum(arr) / arr.length) * 10) / 10 : null);
  const recentHr = last7.filter((a) => a.avgHr).map((a) => a.avgHr);
  const priorHr = prior21.filter((a) => a.avgHr).map((a) => a.avgHr);

  return {
    sampleSize: activities.length,
    dateRange: { from: sorted[0].startDate, to: sorted[sorted.length - 1].startDate },
    ageYears: age,
    ageSource: age != null ? "self_reported" : "unavailable",
    trainingLoad: load,
    biomechanics,
    activitiesLast7Days: last7.length,
    restDaysLast14,
    longestConsecutiveActiveDays: longestStreak,
    sportMix,
    weeklyDistanceKm: weeklyDistance,
    totalElevationGainM: Math.round(totalElevationGainM),
    longestActivity: longest ? { name: longest.name, sport: longest.sport, distanceKm: Math.round((longest.distanceKm || 0) * 10) / 10, movingMin: Math.round(longest.movingMin || 0) } : null,
    avgHeartRateLast7Days: avg(recentHr),
    avgHeartRatePrior21Days: avg(priorHr),
  };
}
