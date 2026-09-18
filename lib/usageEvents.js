// Fire-and-log usage tracking for the admin module — a failure here must
// never break the real feature it's attached to, so every call is
// wrapped and only console.error'd, matching the "log and continue"
// pattern the rest of this codebase uses for best-effort side effects
// (see app/api/import/route.js's gear-fetch try/catches).

import { logUsageEvent } from "./db.js";
import { parseUserAgent } from "./userAgent.js";

export async function trackEvent(request, userId, eventType, metadata = null) {
  try {
    const { browser, deviceType } = parseUserAgent(request.headers.get("user-agent"));
    await logUsageEvent(userId, eventType, { metadata, browser, deviceType });
  } catch (e) {
    console.error(`Failed to log usage event "${eventType}" for user ${userId}:`, e);
  }
}
