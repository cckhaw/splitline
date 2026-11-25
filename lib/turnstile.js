// Cloudflare Turnstile verification. Enabled only when both
// TURNSTILE_SECRET_KEY (server) and NEXT_PUBLIC_TURNSTILE_SITE_KEY
// (client widget) are set, so the app keeps working until the keys are
// added. Once set, it's enforced on signup and login.

import { NextResponse } from "next/server";
import { clientIp } from "./rateLimit.js";

export function turnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

// Returns null if OK (or disabled), else a 400 NextResponse.
export async function requireTurnstile(request, token) {
  if (!turnstileEnabled()) return null;
  const fail = () =>
    NextResponse.json(
      { error: "captcha_failed", message: "Please complete the human-verification check and try again." },
      { status: 400 }
    );
  if (!token || typeof token !== "string" || token.length > 4096) return fail();
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: clientIp(request) }),
    });
    const data = await res.json();
    return data.success === true ? null : fail();
  } catch (e) {
    console.error("Turnstile verification error:", e);
    return fail();
  }
}
