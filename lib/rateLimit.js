// Postgres-backed fixed-window rate limiting (see hitRateLimit in db.js).
// Fails OPEN if the rate_limits table is missing (schema.sql not re-run
// yet) or the database hiccups — a limiter outage must not take login
// down — but logs loudly so it gets noticed.

import { NextResponse } from "next/server";
import { hitRateLimit } from "./db.js";

export function clientIp(request) {
  // Vercel sets x-real-ip / x-vercel-forwarded-for from the connecting
  // client; these can't be spoofed by the caller there, unlike a raw
  // x-forwarded-for.
  const h = request.headers;
  const ip =
    h.get("x-vercel-forwarded-for") ||
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0] ||
    "unknown";
  return ip.trim() || "unknown";
}

// limits: [{ key, limit, windowSeconds }]. Every limit is counted (so a
// blocked client keeps burning its own budget). Returns null when
// allowed, or a ready-to-return 429 NextResponse.
export async function rateLimit(limits) {
  let worst = null;
  for (const { key, limit, windowSeconds } of limits) {
    try {
      const { count, retryAfter } = await hitRateLimit(key, windowSeconds);
      if (count > limit && (!worst || retryAfter > worst)) worst = retryAfter;
    } catch (e) {
      console.error("rate limiter unavailable, failing open:", e?.code || e?.message || e);
      return null;
    }
  }
  if (worst == null) return null;
  return NextResponse.json(
    { error: "rate_limited", message: "Too many attempts. Please wait a bit and try again." },
    { status: 429, headers: { "Retry-After": String(worst) } }
  );
}

// Normalizes an identifier (email) for use inside a limiter key.
export function idKey(value) {
  return String(value || "").toLowerCase().trim().slice(0, 254);
}
