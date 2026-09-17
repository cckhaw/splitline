// Deterministic "own history" half of the Race-Day Engine: how much the
// athlete's pace actually slows on climbs, derived from their own
// imported runs rather than a generic table. Only whole-activity
// averages are available (distance, elevation gain, moving time — no
// per-km splits are stored), so this is a coarse average-grade vs.
// average-pace comparison, not a true grade-adjusted-pace model.

const MIN_DISTANCE_KM = 3;
const MIN_MOVING_MIN = 15;
const FLAT_GRADE_PCT = 0.5;   // "flat-ish" reference runs
const HILLY_GRADE_PCT = 1.5;  // "hilly" comparison runs
const MIN_SAMPLES_PER_GROUP = 3;

// A commonly-cited running heuristic when there isn't enough of the
// athlete's own hilly-vs-flat history to derive one directly: roughly a
// 3% pace cost per 1% of sustained average uphill grade.
const DEFAULT_PCT_SLOWDOWN_PER_GRADE_PCT = 3;

function runSamples(activities) {
  return activities
    .filter((a) => /run/i.test(a.sport || "") && (a.distanceKm || 0) >= MIN_DISTANCE_KM && (a.movingMin || 0) >= MIN_MOVING_MIN)
    .map((a) => {
      const paceMinPerKm = a.movingMin / a.distanceKm;
      const avgGradePct = ((a.elevationGainM || 0) / (a.distanceKm * 1000)) * 100;
      return { paceMinPerKm, avgGradePct };
    });
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

// Returns { pctSlowdownPerGradePct, basis } — basis is "athlete_history"
// when there's enough of the athlete's own flat vs. hilly runs to derive
// it directly, otherwise "default_heuristic".
export function computeGradeAdjustment(activities) {
  const samples = runSamples(activities);
  const flat = samples.filter((s) => s.avgGradePct <= FLAT_GRADE_PCT);
  const hilly = samples.filter((s) => s.avgGradePct >= HILLY_GRADE_PCT);

  if (flat.length >= MIN_SAMPLES_PER_GROUP && hilly.length >= MIN_SAMPLES_PER_GROUP) {
    const flatPace = avg(flat.map((s) => s.paceMinPerKm));
    const hillyPace = avg(hilly.map((s) => s.paceMinPerKm));
    const flatGrade = avg(flat.map((s) => s.avgGradePct));
    const hillyGrade = avg(hilly.map((s) => s.avgGradePct));
    const gradeDelta = hillyGrade - flatGrade;
    if (gradeDelta > 0 && flatPace > 0) {
      const pctSlowdown = ((hillyPace - flatPace) / flatPace / gradeDelta) * 100;
      // Sanity-bound: a wildly negative/extreme derived value (small,
      // noisy sample) is less useful than the documented default.
      if (pctSlowdown > 0 && pctSlowdown < 15) {
        return { pctSlowdownPerGradePct: Math.round(pctSlowdown * 10) / 10, basis: "athlete_history", flatPaceMinPerKm: Math.round(flatPace * 100) / 100 };
      }
    }
  }

  return { pctSlowdownPerGradePct: DEFAULT_PCT_SLOWDOWN_PER_GRADE_PCT, basis: "default_heuristic", flatPaceMinPerKm: avg(samples.map((s) => s.paceMinPerKm)) };
}
