// Training-load and race-pace estimates computed from the athlete's own
// imported activities. These are informational heuristics from sports
// science, not a coaching plan or medical guidance — see the caveats
// baked into the returned `status`/`note` strings, which the UI should
// surface as-is rather than dropping.

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;

// A duration-weighted intensity proxy — real TRIMP needs resting/max HR
// we don't have, so this is deliberately a rough stand-in, preferring
// heart rate, then power, then pace, in that order of how well each
// tracks physiological effort.
function estimateLoad(a) {
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
