// Plain `pg` — works against Vercel Postgres, Neon, Supabase, or any
// standard Postgres via DATABASE_URL. Nothing host-specific here on
// purpose, so this isn't locked to one provider.

import { Pool } from "pg";
import { encrypt, decrypt } from "./crypto.js";

let pool;
function db() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See README.md, \"Provision a database\".");
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params) {
  const res = await db().query(text, params);
  return res.rows;
}

// ---------- users ----------
export async function createUser(email, passwordHash) {
  const rows = await query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
    [email.toLowerCase().trim(), passwordHash]
  );
  return rows[0];
}
export async function getUserByEmail(email) {
  const rows = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
  return rows[0] || null;
}
export async function getUserById(id) {
  const rows = await query(`SELECT id, email, created_at FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// ---------- strava connections ----------
export async function saveStravaConnection(userId, { athleteId, accessToken, refreshToken, expiresAt, ownClientId, ownClientSecret }) {
  await query(
    `INSERT INTO strava_connections (user_id, strava_athlete_id, access_token, refresh_token, expires_at, own_client_id, own_client_secret)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO UPDATE SET
       strava_athlete_id = EXCLUDED.strava_athlete_id,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       own_client_id = EXCLUDED.own_client_id,
       own_client_secret = EXCLUDED.own_client_secret`,
    [
      userId,
      athleteId ?? null,
      encrypt(accessToken),
      encrypt(refreshToken),
      expiresAt,
      ownClientId || null,
      ownClientSecret ? encrypt(ownClientSecret) : null,
    ]
  );
}

// Updates only the token fields after a refresh — keeps own_client_id/secret untouched.
export async function updateStravaTokens(userId, { accessToken, refreshToken, expiresAt }) {
  await query(
    `UPDATE strava_connections SET access_token = $2, refresh_token = $3, expires_at = $4 WHERE user_id = $1`,
    [userId, encrypt(accessToken), encrypt(refreshToken), expiresAt]
  );
}

export async function getStravaConnection(userId) {
  const rows = await query(`SELECT * FROM strava_connections WHERE user_id = $1`, [userId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    athleteId: r.strava_athlete_id,
    accessToken: decrypt(r.access_token),
    refreshToken: decrypt(r.refresh_token),
    expiresAt: Number(r.expires_at),
    ownClientId: r.own_client_id,
    ownClientSecret: r.own_client_secret ? decrypt(r.own_client_secret) : null,
  };
}

// ---------- activities ----------
export async function upsertActivity(userId, a) {
  await query(
    `INSERT INTO activities
       (user_id, strava_activity_id, name, sport, start_date, distance_km, moving_min,
        elevation_gain_m, avg_hr, avg_watts, avg_speed_kmh, calories, trace)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (user_id, strava_activity_id) DO UPDATE SET
       name = EXCLUDED.name, sport = EXCLUDED.sport, start_date = EXCLUDED.start_date,
       distance_km = EXCLUDED.distance_km, moving_min = EXCLUDED.moving_min,
       elevation_gain_m = EXCLUDED.elevation_gain_m, avg_hr = EXCLUDED.avg_hr,
       avg_watts = EXCLUDED.avg_watts, avg_speed_kmh = EXCLUDED.avg_speed_kmh,
       calories = EXCLUDED.calories, trace = EXCLUDED.trace`,
    [
      userId, a.stravaActivityId, a.name, a.sport, a.startDate, a.distanceKm, a.movingMin,
      a.elevationGainM, a.avgHr, a.avgWatts, a.avgSpeedKmh, a.calories, JSON.stringify(a.trace || null),
    ]
  );
}

export async function getActivitiesForUser(userId, limit = 30) {
  const rows = await query(
    `SELECT * FROM activities WHERE user_id = $1 ORDER BY start_date DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(rowToActivity);
}

export async function getActivityById(userId, activityRowId) {
  const rows = await query(`SELECT * FROM activities WHERE user_id = $1 AND id = $2`, [userId, activityRowId]);
  return rows[0] ? rowToActivity(rows[0]) : null;
}

export async function countActivitiesForUser(userId) {
  const rows = await query(`SELECT count(*)::int AS n FROM activities WHERE user_id = $1`, [userId]);
  return rows[0].n;
}

function rowToActivity(r) {
  return {
    id: r.id,
    stravaActivityId: Number(r.strava_activity_id),
    name: r.name,
    sport: r.sport,
    startDate: r.start_date,
    distanceKm: r.distance_km,
    movingMin: r.moving_min,
    elevationGainM: r.elevation_gain_m,
    avgHr: r.avg_hr,
    avgWatts: r.avg_watts,
    avgSpeedKmh: r.avg_speed_kmh,
    calories: r.calories,
    trace: r.trace,
  };
}
