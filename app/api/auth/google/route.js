import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authorizeUrl, isConfigured } from "@/lib/google";

export const runtime = "nodejs";

// A plain link (`<a href="/api/auth/google">`), not a fetch — the
// browser needs to navigate to Google directly, so this is a GET that
// 302s straight to Google's consent screen.
export async function GET(request) {
  const url = new URL(request.url);
  if (!isConfigured()) {
    return NextResponse.redirect(`${url.origin}/login?error=google_not_configured`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${url.origin}/api/auth/google/callback`;

  const res = NextResponse.redirect(authorizeUrl(redirectUri, state));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
