// Deterministic "physics model" half of the Biomechanical & Overtraining
// Shield — computed in code from each activity's own time-series streams
// (see app/api/import/route.js), not guessed by the LLM. Claude (in
// lib/anthropic.js) only interprets these numbers; it never invents them.
//
// Aerobic decoupling (Pw:HR / Pa:HR): within one sustained effort, compare
// an efficiency ratio (output ÷ heart rate) in the first half vs. the
// second half. A ratio that falls as the effort goes on — more heart-rate
// "cost" for the same pace/power — is a well-known cardiac-drift signal:
// under ~5% is a well-matched aerobic effort, 5-10% borderline, over 10%
// a notable drift worth flagging. This needs a reasonably sustained,
// steady effort to mean anything, so it's skipped for short/interval
// activities (see MIN_SAMPLES/MIN_MOVING_MIN below).
//
// Cadence drift: average stride/pedal rate in the first half vs. the
// second half of the same effort — a falling cadence late in a long run
// is a commonly-cited proxy for the kind of form breakdown that raises
// injury risk (overstriding, heel-braking) even when pace holds.

const MIN_SAMPLES = 40; // ~enough resolution to split into two meaningful halves
const MIN_MOVING_MIN = 18; // decoupling is noise on short/interval efforts

function avg(arr) {
  const vals = arr.filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function halves(arr) {
  const mid = Math.floor(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

// Returns { decouplingPct, basis } or null if the activity's streams don't
// support a meaningful read. basis is "power" or "pace" — whichever
// output metric was available (power preferred when present).
export function computeDecoupling(activity) {
  const trace = activity.trace || {};
  const hr = trace.heart_rate;
  if (!hr || hr.length < MIN_SAMPLES || (activity.movingMin || 0) < MIN_MOVING_MIN) return null;

  const output = trace.power?.length === hr.length ? trace.power : trace.pace?.length === hr.length ? trace.pace : null;
  if (!output) return null;
  const basis = trace.power?.length === hr.length ? "power" : "pace";

  const [hr1, hr2] = halves(hr);
  const [o1, o2] = halves(output);
  const avgHr1 = avg(hr1), avgHr2 = avg(hr2), avgO1 = avg(o1), avgO2 = avg(o2);
  if (!avgHr1 || !avgHr2 || !avgO1 || !avgO2) return null;

  const ratio1 = avgO1 / avgHr1;
  const ratio2 = avgO2 / avgHr2;
  if (!Number.isFinite(ratio1) || ratio1 <= 0) return null;

  const decouplingPct = Math.round(((ratio1 - ratio2) / ratio1) * 1000) / 10;
  return { decouplingPct, basis };
}

// Returns { cadenceDriftPct } or null. Negative = cadence fell late in
// the effort (the overstriding/fatigue proxy); positive = held or rose.
export function computeCadenceDrift(activity) {
  const cadence = activity.trace?.cadence;
  if (!cadence || cadence.length < MIN_SAMPLES || (activity.movingMin || 0) < MIN_MOVING_MIN) return null;
  const [c1, c2] = halves(cadence);
  const avg1 = avg(c1), avg2 = avg(c2);
  if (!avg1 || !avg2) return null;
  const cadenceDriftPct = Math.round(((avg2 - avg1) / avg1) * 1000) / 10;
  return { cadenceDriftPct };
}

function daysAgo(date, now) {
  return (now - new Date(date)) / (1000 * 60 * 60 * 24);
}

// Aggregates per-activity signals across whatever's been imported (bounded
// by the app's last-30-activities import, not a separate day-windowed
// pull) into rolling day windows. Each window only reports on activities
// that actually fall within it and have usable streams — sparse windows
// (few long, steady efforts) legitimately produce fewer or no reads.
export function summarizeBiomechanics(activities, now = new Date()) {
  const windows = [7, 30, 60, 90];
  const perActivity = activities.map((a) => ({
    activity: a,
    ageDays: daysAgo(a.startDate, now),
    decoupling: computeDecoupling(a),
    cadenceDrift: computeCadenceDrift(a),
  }));

  const windowStats = {};
  for (const days of windows) {
    const inWindow = perActivity.filter((p) => p.ageDays <= days);
    const decouplingReads = inWindow.map((p) => p.decoupling).filter(Boolean);
    const cadenceReads = inWindow.map((p) => p.cadenceDrift).filter(Boolean);
    windowStats[`last${days}Days`] = {
      activitiesConsidered: inWindow.length,
      avgDecouplingPct: decouplingReads.length ? Math.round(avg(decouplingReads.map((d) => d.decouplingPct)) * 10) / 10 : null,
      highDecouplingCount: decouplingReads.filter((d) => d.decouplingPct >= 10).length,
      readableActivities: decouplingReads.length,
      avgCadenceDriftPct: cadenceReads.length ? Math.round(avg(cadenceReads.map((c) => c.cadenceDriftPct)) * 10) / 10 : null,
    };
  }

  const recentFlags = perActivity
    .filter((p) => p.ageDays <= 30 && (p.decoupling?.decouplingPct >= 10 || p.cadenceDrift?.cadenceDriftPct <= -8))
    .slice(0, 5)
    .map((p) => ({
      activityName: p.activity.name,
      daysAgo: Math.round(p.ageDays),
      decouplingPct: p.decoupling?.decouplingPct ?? null,
      decouplingBasis: p.decoupling?.basis ?? null,
      cadenceDriftPct: p.cadenceDrift?.cadenceDriftPct ?? null,
    }));

  return { windows: windowStats, flaggedActivities: recentFlags };
}
