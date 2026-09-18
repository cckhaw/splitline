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

// Postgres 42P01 (undefined_table) / 42703 (undefined_column) almost always
// mean the database is missing a table or column this codebase now expects,
// i.e. schema.sql hasn't been (re-)run since it last changed. Turns a raw
// "relation/column ... does not exist" into something an operator can act on.
export function friendlyDbErrorMessage(e) {
  if (e && (e.code === "42P01" || e.code === "42703")) {
    return "Your database is missing a table or column this feature needs. Run the latest schema.sql against your database (see README.md, \"Provision a database\") and try again.";
  }
  return String(e?.message || e);
}

// ---------- users ----------
export async function createUser(name, email, passwordHash, { emailVerified = false, googleId = null, birthDate = null, tier = "free", tierExpiresAt = null } = {}) {
  const rows = await query(
    `INSERT INTO users (name, email, password_hash, email_verified, google_id, birth_date, tier, tier_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, email, created_at`,
    [name || null, email.toLowerCase().trim(), passwordHash, emailVerified, googleId, birthDate, tier, tierExpiresAt]
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
export async function getUserByStripeCustomerId(customerId) {
  const rows = await query(`SELECT * FROM users WHERE stripe_customer_id = $1`, [customerId]);
  return rows[0] || null;
}
export async function getUserById(id) {
  const rows = await query(
    `SELECT id, name, email, email_verified, google_id, birth_date, weight_kg, tier, tier_expires_at,
            stripe_customer_id, stripe_subscription_id, avatar_url, avatar_source, created_at
     FROM users WHERE id = $1`,
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
// Every other table with a user_id column declares it
// `REFERENCES users(id) ON DELETE CASCADE` (verification_codes, ai_usage,
// ai_insights, race_goals, training_plans, race_day_plans,
// strava_connections, activities, gear, usage_events — see schema.sql) —
// deleting the users row alone erases everything belonging to them.
export async function deleteUser(userId) {
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}
export async function updateUserBirthDate(userId, birthDate) {
  await query(`UPDATE users SET birth_date = $2 WHERE id = $1`, [userId, birthDate]);
}
export async function updateUserWeight(userId, weightKg) {
  await query(`UPDATE users SET weight_kg = $2 WHERE id = $1`, [userId, weightKg]);
}
// Only touches rows that don't already carry a user-uploaded photo, so a
// re-sync's Strava-sourced refresh never clobbers a custom crop.
export async function setStravaAvatar(userId, avatarUrl) {
  await query(
    `UPDATE users SET avatar_url = $2, avatar_source = 'strava'
     WHERE id = $1 AND (avatar_source IS NULL OR avatar_source = 'strava')`,
    [userId, avatarUrl]
  );
}
export async function setUploadedAvatar(userId, dataUrl) {
  await query(`UPDATE users SET avatar_url = $2, avatar_source = 'upload' WHERE id = $1`, [userId, dataUrl]);
}

// ---------- membership / billing ----------
export async function updateUserTier(userId, { tier, tierExpiresAt }) {
  await query(`UPDATE users SET tier = $2, tier_expires_at = $3 WHERE id = $1`, [userId, tier, tierExpiresAt]);
}
export async function setStripeCustomerId(userId, stripeCustomerId) {
  await query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [userId, stripeCustomerId]);
}
export async function updateStripeSubscription(userId, { stripeCustomerId, stripeSubscriptionId, tier, tierExpiresAt }) {
  await query(
    `UPDATE users SET stripe_customer_id = $2, stripe_subscription_id = $3, tier = $4, tier_expires_at = $5 WHERE id = $1`,
    [userId, stripeCustomerId, stripeSubscriptionId, tier, tierExpiresAt]
  );
}

export async function getAiUsage(userId, feature) {
  const rows = await query(`SELECT * FROM ai_usage WHERE user_id = $1 AND feature = $2`, [userId, feature]);
  return rows[0] || null;
}
export async function recordAiUsage(userId, feature) {
  await query(
    `INSERT INTO ai_usage (user_id, feature, last_used_at) VALUES ($1,$2,now())
     ON CONFLICT (user_id, feature) DO UPDATE SET last_used_at = now()`,
    [userId, feature]
  );
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

// ---------- race goals + training plans ----------
export async function saveRaceGoal(userId, { eventType, eventName, eventDate, targetDistance, goalTime }) {
  await query(
    `INSERT INTO race_goals (user_id, event_type, event_name, event_date, target_distance, goal_time)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET
       event_type = EXCLUDED.event_type, event_name = EXCLUDED.event_name,
       event_date = EXCLUDED.event_date, target_distance = EXCLUDED.target_distance,
       goal_time = EXCLUDED.goal_time, created_at = now()`,
    [userId, eventType, eventName, eventDate, targetDistance, goalTime || null]
  );
  // Deliberately does NOT delete the cached training_plans row here — a
  // stale cached plan for the old goal is still useful to
  // /api/training-plan's tier-eligibility check (it compares the plan's
  // input_hash against the new goal to decide whether to show it,
  // regenerate, or show "locked"). Deleting it would let a free-tier
  // user reset their refresh clock just by re-entering a goal.
}
export async function getRaceGoal(userId) {
  const rows = await query(`SELECT * FROM race_goals WHERE user_id = $1`, [userId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    eventType: r.event_type, eventName: r.event_name, eventDate: r.event_date,
    targetDistance: r.target_distance, goalTime: r.goal_time, createdAt: r.created_at,
  };
}
export async function deleteRaceGoal(userId) {
  await query(`DELETE FROM race_goals WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM training_plans WHERE user_id = $1`, [userId]);
}

export async function getTrainingPlan(userId) {
  const rows = await query(`SELECT * FROM training_plans WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}
export async function saveTrainingPlan(userId, inputHash, payload) {
  await query(
    `INSERT INTO training_plans (user_id, input_hash, payload) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET input_hash = EXCLUDED.input_hash, payload = EXCLUDED.payload, generated_at = now()`,
    [userId, inputHash, JSON.stringify(payload)]
  );
}

export async function getRaceDayPlan(userId) {
  const rows = await query(`SELECT * FROM race_day_plans WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}
export async function saveRaceDayPlan(userId, inputHash, raceDayInputs, payload) {
  await query(
    `INSERT INTO race_day_plans (user_id, input_hash, race_day_inputs, payload) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET
       input_hash = EXCLUDED.input_hash, race_day_inputs = EXCLUDED.race_day_inputs,
       payload = EXCLUDED.payload, generated_at = now()`,
    [userId, inputHash, JSON.stringify(raceDayInputs), JSON.stringify(payload)]
  );
}

// ---------- activities ----------
export async function upsertActivity(userId, a) {
  await query(
    `INSERT INTO activities
       (user_id, strava_activity_id, name, sport, start_date, distance_km, moving_min,
        elevation_gain_m, avg_hr, avg_watts, avg_speed_kmh, calories, trace, gear_id, avg_temp_c)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (user_id, strava_activity_id) DO UPDATE SET
       name = EXCLUDED.name, sport = EXCLUDED.sport, start_date = EXCLUDED.start_date,
       distance_km = EXCLUDED.distance_km, moving_min = EXCLUDED.moving_min,
       elevation_gain_m = EXCLUDED.elevation_gain_m, avg_hr = EXCLUDED.avg_hr,
       avg_watts = EXCLUDED.avg_watts, avg_speed_kmh = EXCLUDED.avg_speed_kmh,
       calories = EXCLUDED.calories, trace = EXCLUDED.trace, gear_id = EXCLUDED.gear_id,
       avg_temp_c = EXCLUDED.avg_temp_c`,
    [
      userId, a.stravaActivityId, a.name, a.sport, a.startDate, a.distanceKm, a.movingMin,
      a.elevationGainM, a.avgHr, a.avgWatts, a.avgSpeedKmh, a.calories, JSON.stringify(a.trace || null),
      a.gearId || null, a.avgTempC ?? null,
    ]
  );
}

// ---------- gear ----------
export async function upsertGear(userId, g) {
  await query(
    `INSERT INTO gear (id, user_id, gear_type, name, brand_name, model_name, distance_km, retired)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, id) DO UPDATE SET
       gear_type = EXCLUDED.gear_type, name = EXCLUDED.name, brand_name = EXCLUDED.brand_name,
       model_name = EXCLUDED.model_name, distance_km = EXCLUDED.distance_km, retired = EXCLUDED.retired,
       updated_at = now()`,
    [g.id, userId, g.gearType, g.name, g.brandName, g.modelName, g.distanceKm, Boolean(g.retired)]
  );
}
export async function getGearForUser(userId) {
  const rows = await query(`SELECT * FROM gear WHERE user_id = $1 ORDER BY distance_km DESC NULLS LAST`, [userId]);
  return rows.map((r) => ({
    id: r.id,
    gearType: r.gear_type,
    name: r.name,
    brandName: r.brand_name,
    modelName: r.model_name,
    distanceKm: r.distance_km,
    retired: r.retired,
    updatedAt: r.updated_at,
  }));
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
    avgTempC: r.avg_temp_c,
  };
}

// ---------- usage events (admin module) ----------

export async function logUsageEvent(userId, eventType, { metadata = null, browser = null, deviceType = null } = {}) {
  await query(
    `INSERT INTO usage_events (user_id, event_type, metadata, browser, device_type) VALUES ($1,$2,$3,$4,$5)`,
    [userId, eventType, metadata ? JSON.stringify(metadata) : null, browser, deviceType]
  );
}

// ---------- admin queries ----------
// Aggregate reads for the admin dashboard only — never used on any
// user-facing path, so these skip the camelCase row-shaping the rest of
// this file does and just return raw rows for the admin API routes to
// serialize directly.

export async function adminListUsers() {
  return query(`
    SELECT u.id, u.name, u.email, u.tier, u.tier_expires_at, u.stripe_customer_id, u.created_at,
      (SELECT count(*)::int FROM activities a WHERE a.user_id = u.id) AS activity_count,
      (SELECT max(ue.created_at) FROM usage_events ue WHERE ue.user_id = u.id) AS last_active_at
    FROM users u
    ORDER BY u.created_at DESC
  `);
}

export async function adminGetUser(userId) {
  const rows = await query(
    `SELECT id, name, email, tier, tier_expires_at, stripe_customer_id, created_at,
            (SELECT count(*)::int FROM activities a WHERE a.user_id = users.id) AS activity_count
     FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function adminUserEventCounts(userId) {
  return query(
    `SELECT event_type, count(*)::int AS n FROM usage_events WHERE user_id = $1 GROUP BY event_type`,
    [userId]
  );
}

export async function adminUserRecentEvents(userId, limit = 50) {
  return query(
    `SELECT event_type, metadata, browser, device_type, created_at
     FROM usage_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function adminEventTypeTotals() {
  return query(`SELECT event_type, count(*)::int AS n FROM usage_events GROUP BY event_type ORDER BY n DESC`);
}

// Device/browser split by *user*, not raw event volume — otherwise one
// heavy clicker on one device would dominate the count. Each user's most
// recent event decides their counted device/browser.
export async function adminDeviceBrowserSplit() {
  return query(`
    SELECT DISTINCT ON (user_id) user_id, device_type, browser
    FROM usage_events
    WHERE device_type IS NOT NULL
    ORDER BY user_id, created_at DESC
  `);
}

// ---------- deleted-user tracking (win-back / feedback outreach) ----------

export async function recordDeletedUser({
  originalUserId, name, email, tier, wasTrial, signedUpAt, activityCount, eventCounts, reason,
}) {
  await query(
    `INSERT INTO deleted_users (original_user_id, name, email, tier, was_trial, signed_up_at, activity_count, event_counts, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [originalUserId, name, email, tier, wasTrial, signedUpAt, activityCount, eventCounts ? JSON.stringify(eventCounts) : null, reason || null]
  );
}

export async function adminListDeletedUsers() {
  return query(`SELECT * FROM deleted_users ORDER BY deleted_at DESC`);
}

export async function adminSetDeletedUserContacted(id, contacted) {
  await query(`UPDATE deleted_users SET contacted_at = $2 WHERE id = $1`, [id, contacted ? new Date() : null]);
}

export async function adminSetDeletedUserNotes(id, notes) {
  await query(`UPDATE deleted_users SET admin_notes = $2 WHERE id = $1`, [id, notes]);
}

export async function adminDeleteDeletedUserRecord(id) {
  await query(`DELETE FROM deleted_users WHERE id = $1`, [id]);
}

// ---------- admin tier override ----------

export async function adminSetUserTier(userId, tier, tierExpiresAt) {
  await query(`UPDATE users SET tier = $2, tier_expires_at = $3 WHERE id = $1`, [userId, tier, tierExpiresAt]);
}
