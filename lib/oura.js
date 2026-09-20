// Talks to Oura Ring's public API v2 — https://cloud.ouraring.com/v2/docs.
// Standard OAuth2 authorization-code flow against the platform's own
// registered Oura application (OURA_CLIENT_ID/OURA_CLIENT_SECRET) —
// unlike Strava, there's no "bring your own app" option here, since Oura
// doesn't have the same per-app rate-limit story that made that worth
// offering for Strava.
//
// NOTE: this project's dev sandbox could not exercise any of this
// against a live call — its egress policy blocks arbitrary third-party
// hosts, confirmed by a direct attempt (both cloud.ouraring.com and
// api.ouraring.com came back connect_rejected). Everything below matches
// Oura's documented v2 API shapes and field names, but an actual
// deployment is the first place this gets a real end-to-end test —
// same caveat as lib/weather.js's Open-Meteo integration.

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API_BASE = "https://api.ouraring.com/v2/usercollection";
// "daily" covers the daily_sleep/daily_readiness/sleep summary endpoints
// this integration reads; "personal" is only used for personal_info
// (not currently displayed, fetched once at connect time for reference).
const SCOPE = "daily personal";
const FETCH_TIMEOUT_MS = 10000;
const MAX_PAGES = 10; // guards against an unbounded next_token loop

export function platformCredentials() {
  return {
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
  };
}

export function authorizeUrl(redirectUri, state, clientId) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Oura token request failed (${res.status}): ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_in, token_type, scope }
}

export function exchangeCode(code, redirectUri, clientId, clientSecret) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
}

export function refreshAccessToken(refreshToken, clientId, clientSecret) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
}

// `connection` is the shape returned by lib/db.js's getOuraConnection.
// Returns a fresh access token and, if refreshed, the new fields to
// persist (caller decides how — see lib/db.js's updateOuraTokens).
export async function getValidAccessToken(connection) {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expiresAt && connection.expiresAt - 120 > now) {
    return { accessToken: connection.accessToken, refreshed: null };
  }
  const { clientId, clientSecret } = platformCredentials();
  const r = await refreshAccessToken(connection.refreshToken, clientId, clientSecret);
  const expiresAt = Math.floor(Date.now() / 1000) + Number(r.expires_in || 0);
  return {
    accessToken: r.access_token,
    refreshed: { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt },
  };
}

// Follows `next_token` pagination (Oura v2's convention across
// usercollection endpoints) up to MAX_PAGES — plenty for the few weeks
// of data this app ever requests.
async function ouraFetchAll(path, accessToken, params) {
  const items = [];
  let nextToken = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams(params);
    if (nextToken) query.set("next_token", nextToken);
    const res = await fetch(`${API_BASE}${path}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Oura API error ${res.status} on ${path}: ${await res.text()}`);
    const body = await res.json();
    items.push(...(body.data || []));
    nextToken = body.next_token || null;
    if (!nextToken) break;
  }
  return items;
}

export function listSleepPeriods(accessToken, startDate, endDate) {
  return ouraFetchAll("/sleep", accessToken, { start_date: startDate, end_date: endDate });
}
export function listDailySleep(accessToken, startDate, endDate) {
  return ouraFetchAll("/daily_sleep", accessToken, { start_date: startDate, end_date: endDate });
}
export function listDailyReadiness(accessToken, startDate, endDate) {
  return ouraFetchAll("/daily_readiness", accessToken, { start_date: startDate, end_date: endDate });
}
export async function getPersonalInfo(accessToken) {
  const res = await fetch(`${API_BASE}/personal_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Oura API error ${res.status} on /personal_info: ${await res.text()}`);
  return res.json(); // { id, age, weight, height, biological_sex, email }
}

const SEC_PER_MIN = 60;

// Merges the three endpoints above into one row per calendar day, ready
// for lib/db.js's upsertOuraDailyMetric. `/sleep` can return more than
// one period per day (naps); only "long_sleep" (the main nightly sleep)
// feeds the sleep-stage/HRV/resting-HR numbers this app displays.
export async function fetchDailyMetrics(accessToken, startDate, endDate) {
  const [sleepPeriods, dailySleep, dailyReadiness] = await Promise.all([
    listSleepPeriods(accessToken, startDate, endDate),
    listDailySleep(accessToken, startDate, endDate),
    listDailyReadiness(accessToken, startDate, endDate),
  ]);

  const byDay = new Map();
  const dayRow = (day) => {
    if (!byDay.has(day)) byDay.set(day, { day });
    return byDay.get(day);
  };

  for (const p of sleepPeriods) {
    if (p.type !== "long_sleep" || !p.day) continue;
    const row = dayRow(p.day);
    row.totalSleepMin = p.total_sleep_duration != null ? p.total_sleep_duration / SEC_PER_MIN : null;
    row.deepSleepMin = p.deep_sleep_duration != null ? p.deep_sleep_duration / SEC_PER_MIN : null;
    row.remSleepMin = p.rem_sleep_duration != null ? p.rem_sleep_duration / SEC_PER_MIN : null;
    row.lightSleepMin = p.light_sleep_duration != null ? p.light_sleep_duration / SEC_PER_MIN : null;
    row.sleepEfficiencyPct = p.efficiency ?? null;
    row.avgHrvMs = p.average_hrv ?? null;
    row.restingHrBpm = p.lowest_heart_rate ?? null;
  }
  for (const d of dailySleep) {
    if (!d.day) continue;
    dayRow(d.day).sleepScore = d.score ?? null;
  }
  for (const d of dailyReadiness) {
    if (!d.day) continue;
    dayRow(d.day).readinessScore = d.score ?? null;
  }

  return [...byDay.values()];
}
