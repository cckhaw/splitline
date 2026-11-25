// Cost guards in front of every Claude call. The tier interval check in
// lib/membership.js is "check, generate, then record", so parallel
// requests used to race past it; and Pro (incl. the free 90-day trial)
// has no interval at all. These counters are claimed *before* the model
// is called:
//   - one generation per user per feature per 2 minutes (closes the race)
//   - a per-user hourly cap across all AI features
//   - a global daily cap (AI_DAILY_CAP, default 1000) as a spend backstop;
//     hitting it logs an error line you can alert on.
// Returns true if the caller may proceed to call the model.

import { hitRateLimit } from "./db.js";

const USER_HOURLY_CAP = 12;
const DEFAULT_DAILY_CAP = 1000;

export async function reserveAiGeneration(userId, feature) {
  try {
    const global = await hitRateLimit("ai:global:day", 24 * 60 * 60);
    const cap = Number(process.env.AI_DAILY_CAP) || DEFAULT_DAILY_CAP;
    if (global.count > cap) {
      if (global.count === cap + 1) console.error(`[ALERT] AI daily generation cap (${cap}) reached — new generations paused until the window resets.`);
      return false;
    }
    const dup = await hitRateLimit(`ai:user:${userId}:${feature}`, 120);
    if (dup.count > 1) return false;
    const hourly = await hitRateLimit(`ai:user:${userId}:hour`, 3600);
    return hourly.count <= USER_HOURLY_CAP;
  } catch (e) {
    // Limiter table missing / DB blip: fall back to the tier check alone
    // rather than breaking the feature.
    console.error("AI budget check unavailable, allowing:", e?.code || e?.message || e);
    return true;
  }
}
