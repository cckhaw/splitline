// Talks to Strava's public v3 API — https://developers.strava.com.
// Every function that needs app credentials takes them as arguments
// (falling back to the platform's shared app) rather than reading
// env vars directly, so a user's own client id/secret (if they opted
// into "bring your own app") flows through the same code path.

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";
const SCOPE = "activity:read_all,profile:read_all";

export function platformCredentials() {
  return {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
  };
}

export function authorizeUrl(redirectUri, state, clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(code, clientId, clientSecret) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed (${res.status}): ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_at, athlete }
}

export async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed (${res.status}): ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_at }
}

// `connection` is the shape returned by lib/db.js's getStravaConnection.
// Returns a fresh access token and, if refreshed, the new token fields
// to persist (caller decides how — see lib/db.js's updateStravaTokens).
export async function getValidAccessToken(connection) {
  const now = Math.floor(Date.now() / 1000);
  const { clientId, clientSecret } = resolveCredentials(connection);
  if (connection.expiresAt && connection.expiresAt - 120 > now) {
    return { accessToken: connection.accessToken, refreshed: null };
  }
  const r = await refreshAccessToken(connection.refreshToken, clientId, clientSecret);
  return {
    accessToken: r.access_token,
    refreshed: { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at },
  };
}

export function resolveCredentials(connection) {
  if (connection?.ownClientId && connection?.ownClientSecret) {
    return { clientId: connection.ownClientId, clientSecret: connection.ownClientSecret };
  }
  return platformCredentials();
}

async function stravaFetch(path, accessToken) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Strava API error ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

export function listActivities(accessToken, perPage = 30, page = 1) {
  return stravaFetch(`/athlete/activities?per_page=${perPage}&page=${page}`, accessToken);
}
export function getActivity(accessToken, id) {
  return stravaFetch(`/activities/${id}`, accessToken);
}
export function getStreams(accessToken, id) {
  return stravaFetch(
    `/activities/${id}/streams?keys=time,heartrate,watts,altitude,distance,velocity_smooth,cadence&key_by_type=true`,
    accessToken
  );
}
export function getGear(accessToken, gearId) {
  return stravaFetch(`/gear/${gearId}`, accessToken);
}
export function getAthlete(accessToken) {
  return stravaFetch(`/athlete`, accessToken);
}
