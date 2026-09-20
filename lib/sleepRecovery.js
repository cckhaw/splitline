// Deterministic "physiology" half of the sleep/recovery signal — real
// measurements from a connected Oura Ring (lib/oura.js, cached in
// oura_daily_metrics), not modeled from activity streams the way
// lib/biomechanics.js's decoupling/cadence-drift signals are. Claude
// (lib/anthropic.js) only interprets these numbers; it never invents
// them — same discipline as the biomechanics module.
//
// The classic combined under-recovery marker this app can now actually
// measure instead of infer from training load alone: resting heart rate
// creeping up while HRV trends down, night over night. Either one alone
// can just be noise (a hot night, alcohol, a mild bug); both moving the
// wrong way together over a week is a well-established sports-science
// signal that the body isn't absorbing training the way it should.

function avg(arr) {
  const vals = arr.filter((v) => v != null && Number.isFinite(v));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

function daysAgo(date, now) {
  return (now - new Date(date)) / (1000 * 60 * 60 * 24);
}

const RECENT_WINDOW_DAYS = 7;
const PRIOR_WINDOW_DAYS = 21; // the 21 days before that — same 7-vs-prior-21 split lib/insights.js already uses for heart rate
const MIN_SAMPLES_FOR_TREND = 3; // a couple of nights, not a single outlier
const HRV_DROP_FLAG_PCT = -5;
const RESTING_HR_RISE_FLAG_PCT = 3;

// `dailyMetrics` is lib/db.js's getOuraMetricsForUser output (oldest
// first), possibly empty when there's no Oura connection or nothing
// synced yet — callers should treat a null return as "no sleep data",
// not an error.
export function summarizeSleepRecovery(dailyMetrics, now = new Date()) {
  if (!dailyMetrics || !dailyMetrics.length) return null;

  const recent = dailyMetrics.filter((d) => daysAgo(d.day, now) <= RECENT_WINDOW_DAYS);
  const prior = dailyMetrics.filter((d) => {
    const a = daysAgo(d.day, now);
    return a > RECENT_WINDOW_DAYS && a <= RECENT_WINDOW_DAYS + PRIOR_WINDOW_DAYS;
  });

  const avgHrvRecent = avg(recent.map((d) => d.avgHrvMs));
  const avgHrvPrior = avg(prior.map((d) => d.avgHrvMs));
  const avgRestingHrRecent = avg(recent.map((d) => d.restingHrBpm));
  const avgRestingHrPrior = avg(prior.map((d) => d.restingHrBpm));

  const enoughForTrend = recent.length >= MIN_SAMPLES_FOR_TREND && prior.length >= MIN_SAMPLES_FOR_TREND;
  const hrvTrendPct = enoughForTrend && avgHrvRecent != null && avgHrvPrior
    ? Math.round(((avgHrvRecent - avgHrvPrior) / avgHrvPrior) * 1000) / 10
    : null;
  const restingHrTrendPct = enoughForTrend && avgRestingHrRecent != null && avgRestingHrPrior
    ? Math.round(((avgRestingHrRecent - avgRestingHrPrior) / avgRestingHrPrior) * 1000) / 10
    : null;

  const underRecoveryFlag = hrvTrendPct != null && restingHrTrendPct != null
    && hrvTrendPct <= HRV_DROP_FLAG_PCT && restingHrTrendPct >= RESTING_HR_RISE_FLAG_PCT;

  return {
    sampleNights: dailyMetrics.length,
    recentNights: recent.length,
    dateRange: { from: dailyMetrics[0].day, to: dailyMetrics[dailyMetrics.length - 1].day },
    avgHrvMs: avgHrvRecent != null ? Math.round(avgHrvRecent * 10) / 10 : null,
    avgRestingHrBpm: avgRestingHrRecent != null ? Math.round(avgRestingHrRecent * 10) / 10 : null,
    avgReadinessScore: (() => { const v = avg(recent.map((d) => d.readinessScore)); return v != null ? Math.round(v) : null; })(),
    avgSleepScore: (() => { const v = avg(recent.map((d) => d.sleepScore)); return v != null ? Math.round(v) : null; })(),
    avgTotalSleepMin: (() => { const v = avg(recent.map((d) => d.totalSleepMin)); return v != null ? Math.round(v) : null; })(),
    avgDeepSleepMin: (() => { const v = avg(recent.map((d) => d.deepSleepMin)); return v != null ? Math.round(v) : null; })(),
    avgRemSleepMin: (() => { const v = avg(recent.map((d) => d.remSleepMin)); return v != null ? Math.round(v) : null; })(),
    hrvTrendPct,
    restingHrTrendPct,
    underRecoveryFlag,
    dailySeries: dailyMetrics.map((d) => ({
      day: d.day, readinessScore: d.readinessScore, sleepScore: d.sleepScore,
      totalSleepMin: d.totalSleepMin, avgHrvMs: d.avgHrvMs, restingHrBpm: d.restingHrBpm,
    })),
  };
}
