// Turns an uploaded GPX course file into the course profile the Race Day
// Plan feature needs: total distance/elevation gain/loss, a resampled
// elevation-vs-distance series for the on-page chart
// (lib/courseProfileChart.js), and a coarser per-segment breakdown fed
// to the race-day AI call (lib/anthropic.js's generateRaceDayPlan) so
// pacing can be grounded in the course's real terrain.

const EARTH_RADIUS_KM = 6371;
const RESAMPLE_INTERVAL_M = 50;     // grid spacing used for gain/loss + the chart
const MIN_ELEVATION_DELTA_M = 1;    // sub-meter GPS/barometric noise floor
const MAX_RAW_POINTS = 8000;        // guards against a pathologically dense file
const PROFILE_POINTS = 120;         // chart resolution
const SEGMENT_COUNT = 12;           // coarser breakdown for the AI prompt

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Hand-rolled rather than pulling in an XML parser dependency — GPX
// track points follow one very consistent shape in every real-world
// export (Strava, Garmin Connect, Komoot): <trkpt lat=".." lon="..">
// with an optional <ele> child, attributes in either order. This only
// handles that paired open/close tag form, which is what every course
// file actually seen in practice looks like (a self-closing <trkpt/>
// with no children isn't a real route point — it carries no elevation
// or time — so files built entirely from those aren't real course data
// anyway).
function extractPoints(xmlText, tagName) {
  const points = [];
  const re = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let m;
  while ((m = re.exec(xmlText))) {
    const attrs = m[1];
    const inner = m[2];
    const latMatch = attrs.match(/\blat="(-?[\d.]+)"/i);
    const lonMatch = attrs.match(/\blon="(-?[\d.]+)"/i);
    if (!latMatch || !lonMatch) continue;
    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleMatch = inner.match(/<ele>\s*(-?[\d.]+)\s*<\/ele>/i);
    const eleM = eleMatch ? parseFloat(eleMatch[1]) : null;
    points.push({ lat, lon, eleM: Number.isFinite(eleM) ? eleM : null });
  }
  return points;
}

// `<trkpt>` (a recorded track) first, falling back to `<rtept>` (a
// planned route) for GPX files exported as a route rather than a track —
// both describe the same thing for this feature's purposes.
export function parseGpxTrackPoints(xmlText) {
  const trackPoints = extractPoints(xmlText, "trkpt");
  if (trackPoints.length) return trackPoints;
  return extractPoints(xmlText, "rtept");
}

function capPoints(points, max) {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  return points.filter((_, i) => i % stride === 0);
}

function cumulativeDistancesKm(points) {
  const dist = [0];
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1] + haversineKm(points[i - 1], points[i]));
  }
  return dist;
}

// Resamples elevation onto a fixed-distance grid via linear
// interpolation. This does double duty as a noise reducer — it
// standardizes the gain/loss calculation regardless of how densely the
// original file recorded points (a Garmin export and a hand-drawn
// Strava route-builder file can differ by 100x in point density for the
// same real course).
function resampleElevation(distancesKm, elevations, stepM) {
  const totalKm = distancesKm[distancesKm.length - 1];
  const stepKm = stepM / 1000;
  const grid = [];
  let idx = 0;
  for (let d = 0; d <= totalKm + 1e-9; d += stepKm) {
    while (idx < distancesKm.length - 2 && distancesKm[idx + 1] < d) idx++;
    const d0 = distancesKm[idx];
    const d1 = idx + 1 < distancesKm.length ? distancesKm[idx + 1] : d0;
    const e0 = elevations[idx];
    const e1 = idx + 1 < elevations.length ? elevations[idx + 1] : e0;
    let ele = null;
    if (e0 != null && e1 != null) {
      ele = d1 === d0 ? e0 : e0 + ((d - d0) / (d1 - d0)) * (e1 - e0);
    }
    grid.push({ distanceKm: Math.round(d * 1000) / 1000, elevationM: ele != null ? Math.round(ele * 10) / 10 : null });
  }
  const last = grid[grid.length - 1];
  if (!last || Math.abs(last.distanceKm - totalKm) > 0.001) {
    grid.push({ distanceKm: Math.round(totalKm * 1000) / 1000, elevationM: elevations[elevations.length - 1] ?? null });
  }
  return grid;
}

// Sums only deltas that clear a noise floor, and only counts a step
// once it's confirmed (comparing against the last *counted* elevation,
// not the immediately preceding sample) — the standard technique for
// GPS/barometric elevation-gain figures that don't wildly overcount
// sensor jitter as "climbing."
function computeGainLoss(grid) {
  let gain = 0;
  let loss = 0;
  let baseline = null;
  for (const pt of grid) {
    if (pt.elevationM == null) continue;
    if (baseline == null) {
      baseline = pt.elevationM;
      continue;
    }
    const delta = pt.elevationM - baseline;
    if (Math.abs(delta) >= MIN_ELEVATION_DELTA_M) {
      if (delta > 0) gain += delta;
      else loss += -delta;
      baseline = pt.elevationM;
    }
  }
  return { gainM: Math.round(gain), lossM: Math.round(loss) };
}

function minMaxElevation(grid) {
  const vals = grid.map((p) => p.elevationM).filter((v) => v != null);
  if (!vals.length) return { min: null, max: null };
  return { min: Math.round(Math.min(...vals)), max: Math.round(Math.max(...vals)) };
}

function downsampleEvenly(arr, targetCount) {
  if (arr.length <= targetCount) return arr;
  const stride = (arr.length - 1) / (targetCount - 1);
  const result = [];
  for (let i = 0; i < targetCount; i++) result.push(arr[Math.round(i * stride)]);
  return result;
}

// A coarser distance-based breakdown than the chart's profile — fed to
// the AI so segment_pacing can be tied to where the real climbs and
// descents are, rather than a single whole-course elevation-gain figure.
function buildSegments(grid, totalDistanceKm, segmentCount) {
  const segLenKm = totalDistanceKm / segmentCount;
  const segments = [];
  for (let s = 0; s < segmentCount; s++) {
    const startKm = s * segLenKm;
    const endKm = s === segmentCount - 1 ? totalDistanceKm : (s + 1) * segLenKm;
    const slice = grid.filter((p) => p.distanceKm >= startKm - 1e-6 && p.distanceKm <= endKm + 1e-6);
    const { gainM, lossM } = computeGainLoss(slice);
    const elevations = slice.map((p) => p.elevationM).filter((v) => v != null);
    const netChangeM = elevations.length >= 2 ? elevations[elevations.length - 1] - elevations[0] : 0;
    const distKm = endKm - startKm;
    segments.push({
      startKm: Math.round(startKm * 100) / 100,
      endKm: Math.round(endKm * 100) / 100,
      distanceKm: Math.round(distKm * 100) / 100,
      elevationGainM: gainM,
      elevationLossM: lossM,
      avgGradePct: distKm > 0 ? Math.round((netChangeM / (distKm * 1000)) * 1000) / 10 : 0,
    });
  }
  return segments;
}

// `points` is parseGpxTrackPoints' output. Throws (with a message safe
// to show the athlete) rather than returning something misleading when
// the file doesn't actually describe a usable course.
export function buildCourseProfile(rawPoints, { profilePoints = PROFILE_POINTS, segmentCount = SEGMENT_COUNT } = {}) {
  const points = capPoints(rawPoints, MAX_RAW_POINTS);
  if (points.length < 2) {
    throw new Error("That GPX file doesn't have enough track points to build a course profile.");
  }

  const distancesKm = cumulativeDistancesKm(points);
  const totalDistanceKm = distancesKm[distancesKm.length - 1];
  if (totalDistanceKm < 0.1) {
    throw new Error("That GPX file's route is too short to be a race course.");
  }

  const elevations = points.map((p) => p.eleM);
  const hasElevationData = elevations.some((e) => e != null);
  const grid = hasElevationData
    ? resampleElevation(distancesKm, elevations, RESAMPLE_INTERVAL_M)
    : distancesKm.map((d) => ({ distanceKm: Math.round(d * 1000) / 1000, elevationM: null }));

  const { gainM, lossM } = hasElevationData ? computeGainLoss(grid) : { gainM: 0, lossM: 0 };
  const { min, max } = hasElevationData ? minMaxElevation(grid) : { min: null, max: null };

  return {
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    totalElevationGainM: gainM,
    totalElevationLossM: lossM,
    minElevationM: min,
    maxElevationM: max,
    hasElevationData,
    startLat: points[0].lat,
    startLon: points[0].lon,
    profile: downsampleEvenly(grid, profilePoints),
    segments: buildSegments(grid, totalDistanceKm, segmentCount),
  };
}

export function parseGpxCourse(xmlText, opts) {
  const points = parseGpxTrackPoints(xmlText);
  if (!points.length) {
    throw new Error("Couldn't find any track points in that GPX file — is it a route or activity export?");
  }
  return buildCourseProfile(points, opts);
}
