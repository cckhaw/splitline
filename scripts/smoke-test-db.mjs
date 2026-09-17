// A quick end-to-end check of lib/db.js against whatever DATABASE_URL
// and ENCRYPTION_KEY are set in your environment. Creates one throwaway
// user/connection/activity, verifies encryption round-trips, then
// deletes everything it created. Safe to run against a real database —
// it cleans up after itself.
//
// Usage:
//   DATABASE_URL=... ENCRYPTION_KEY=... node scripts/smoke-test-db.mjs

import * as db from "../lib/db.js";
import bcrypt from "bcryptjs";

const email = `smoke-test-${Date.now()}@example.invalid`;

async function main() {
  const hash = await bcrypt.hash("throwaway-password", 10);
  const user = await db.createUser("Smoke Test", email, hash);
  console.log("✓ created user", user.id);

  const fetched = await db.getUserByEmail(email);
  if (!(await bcrypt.compare("throwaway-password", fetched.password_hash))) {
    throw new Error("password hash didn't verify");
  }
  console.log("✓ password hash round-trips");

  await db.saveStravaConnection(user.id, {
    athleteId: 123456,
    accessToken: "smoke-access-token",
    refreshToken: "smoke-refresh-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ownClientId: null,
    ownClientSecret: null,
  });
  const conn = await db.getStravaConnection(user.id);
  if (conn.accessToken !== "smoke-access-token") throw new Error("token encryption didn't round-trip");
  console.log("✓ Strava token encryption round-trips");

  await db.upsertActivity(user.id, {
    stravaActivityId: 999999,
    name: "Smoke test run",
    sport: "Run",
    startDate: new Date().toISOString(),
    distanceKm: 5,
    movingMin: 25,
    elevationGainM: 10,
    avgHr: 150,
    avgWatts: null,
    avgSpeedKmh: 12,
    calories: 300,
    trace: { elevation: [1, 2, 3], heart_rate: null, power: null },
  });
  const acts = await db.getActivitiesForUser(user.id, 5);
  if (acts.length !== 1) throw new Error("activity didn't save");
  console.log("✓ activity upsert + fetch works");

  await db.query("DELETE FROM users WHERE id = $1", [user.id]); // cascades
  console.log("✓ cleaned up — everything above passed");
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ smoke test failed:", e.message);
  process.exit(1);
});
