// Race-day weather for the Race Day Plan feature, via Open-Meteo — no
// API key needed for either endpoint it uses, unlike every other
// external integration in this app. Forecast API for a date inside its
// horizon; when it isn't (or the forecast call fails for any reason),
// falls back to a historical average across the same calendar date over
// the past few years at the course's start coordinates — the closest
// thing to a climatological normal this feature can offer without a
// paid climate-data provider. The location comes from the athlete's
// uploaded GPX course (lib/gpxCourse.js's startLat/startLon), so there's
// no separate geocoding step.
//
// NOTE: this has not been exercised against a live call in this
// project's dev sandbox — its egress policy blocks arbitrary third-party
// hosts (only a short allowlist passes through), so api.open-meteo.com
// and archive-api.open-meteo.com are both unreachable from here. The
// request/response shapes below match Open-Meteo's documented API, and
// every failure mode (a bad response, a timeout, no data for the date)
// falls through to "try the next thing" rather than throwing, but a real
// deployment is the first place this actually gets called end to end.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_HORIZON_DAYS = 15; // Open-Meteo's daily forecast covers ~16 days out; stay one inside it
const HISTORICAL_YEARS = 5;
const FETCH_TIMEOUT_MS = 8000;

function daysBetween(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
}

function average(arr) {
  const nums = arr.filter((v) => Number.isFinite(v));
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}

async function fetchHourlyStats(baseUrl, lat, lon, dateIso) {
  const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&start_date=${dateIso}&end_date=${dateIso}&hourly=temperature_2m,relative_humidity_2m&timezone=UTC`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
  const data = await res.json();
  const temps = (data?.hourly?.temperature_2m || []).filter(Number.isFinite);
  const humidities = (data?.hourly?.relative_humidity_2m || []).filter(Number.isFinite);
  if (!temps.length) throw new Error("No hourly data returned for that date");
  return {
    temperatureC: average(temps),
    temperatureMinC: Math.min(...temps),
    temperatureMaxC: Math.max(...temps),
    humidityPct: average(humidities),
  };
}

// Returns one of:
//   { source: "forecast", temperatureC, temperatureMinC, temperatureMaxC, humidityPct }
//   { source: "historical_average", sampleYears, temperatureC, temperatureMinC, temperatureMaxC, humidityPct }
//   { source: "unavailable", reason: "no_location" | "fetch_failed" }
export async function getRaceDayWeather({ lat, lon, eventDateIso, now = new Date() }) {
  if (lat == null || lon == null || !eventDateIso) return { source: "unavailable", reason: "no_location" };

  const eventDate = new Date(`${eventDateIso}T00:00:00Z`);
  const daysOut = daysBetween(now, eventDate);

  if (daysOut >= 0 && daysOut <= FORECAST_HORIZON_DAYS) {
    try {
      const stats = await fetchHourlyStats(FORECAST_URL, lat, lon, eventDateIso);
      return { source: "forecast", temperatureC: round1(stats.temperatureC), temperatureMinC: round1(stats.temperatureMinC), temperatureMaxC: round1(stats.temperatureMaxC), humidityPct: stats.humidityPct == null ? null : Math.round(stats.humidityPct) };
    } catch (e) {
      console.error("Race-day forecast fetch failed, falling back to historical average:", e);
    }
  }

  const month = eventDate.getUTCMonth() + 1;
  const day = eventDate.getUTCDate();
  const yearsToTry = [];
  for (let i = 1; i <= HISTORICAL_YEARS; i++) yearsToTry.push(eventDate.getUTCFullYear() - i);

  const results = await Promise.allSettled(
    yearsToTry.map((year) => {
      const realDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
      const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(realDay).padStart(2, "0")}`;
      // Historical years are always well before "now" for a future race
      // date, but guard anyway rather than ever querying the archive for
      // a date it can't have data for yet.
      if (new Date(`${dateIso}T00:00:00Z`) >= now) return Promise.reject(new Error("date not in the past"));
      return fetchHourlyStats(ARCHIVE_URL, lat, lon, dateIso);
    })
  );
  const samples = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!samples.length) {
    for (const r of results) if (r.status === "rejected") console.error("Historical weather fetch failed:", r.reason);
    return { source: "unavailable", reason: "fetch_failed" };
  }

  return {
    source: "historical_average",
    sampleYears: samples.length,
    temperatureC: round1(average(samples.map((s) => s.temperatureC))),
    temperatureMinC: round1(average(samples.map((s) => s.temperatureMinC))),
    temperatureMaxC: round1(average(samples.map((s) => s.temperatureMaxC))),
    humidityPct: (() => {
      const h = average(samples.map((s) => s.humidityPct));
      return h == null ? null : Math.round(h);
    })(),
  };
}
