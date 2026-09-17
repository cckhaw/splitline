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
export async function createUser(name, email, passwordHash, { emailVerified = false, googleId = null } = {}) {
  const rows = await query(
    `INSERT INTO users (name, email, password_hash, email_verified, google_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, created_at`,
    [name || null, email.toLowerCase().trim(), passwordHash, emailVerified, googleId]
  );
  return rows[0];
}
export async function getUserByEmail(email) {
  const rows = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
  return rows[0] || null;
}
export async function getUserByGoogleId(googleId) {
  const rows = await query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
  return rows[0] || null;
}
export async function getUserById(id) {
  const rows = await query(
    `SELECT id, name, email, email_verified, google_id, birth_date, created_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}
export async function setEmailVerified(userId) {
  await query(`UPDATE users SET email_verified = true WHERE id = $1`, [userId]);
}
export async function linkGoogleId(userId, googleId) {
  await query(`UPDATE users SET google_id = $2 WHERE id = $1`, [userId, googleId]);
}
export async function updateUserName(userId, name) {
  await query(`UPDATE users SET name = $2 WHERE id = $1`, [userId, name]);
}
export async function updateUserEmail(userId, email) {
  await query(`UPDATE users SET email = $2, email_verified = true WHERE id = $1`, [userId, email.toLowerCase().trim()]);
}
export async function updateUserPassword(userId, passwordHash) {
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}
export async function updateUserBirthDate(userId, birthDate) {
  await query(`UPDATE users SET birth_date = $2 WHERE id = $1`, [userId, birthDate]);
}

// ---------- email verification codes ----------
export async function createVerificationCode(userId, purpose, codeHash, expiresAt, newEmail = null) {
  await query(
    `INSERT INTO verification_codes (user_id, purpose, code_hash, new_email, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, purpose, codeHash, newEmail, expiresAt]
  );
}
export async function getActiveVerificationCode(userId, purpose) {
  const rows = await query(
    `SELECT * FROM verification_codes
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );
  return rows[0] || null;
}
export async function incrementVerificationAttempts(id) {
  await query(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`, [id]);
}
export async function consumeVerificationCode(id) {
  await query(`UPDATE verification_codes SET consumed_at = now() WHERE id = $1`, [id]);
}

// ---------- AI insights cache ----------
export async function getAiInsights(userId) {
  const rows = await query(`SELECT * FROM ai_insights WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}
export async function saveAiInsights(userId, inputHash, payload) {
  await query(
    `INSERT INTO ai_insights (user_id, input_hash, payload) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET input_hash = EXCLUDED.input_hash, payload = EXCLUDED.payload, generated_at = now()`,
    [userId, inputHash, JSON.stringify(payload)]
  );
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
