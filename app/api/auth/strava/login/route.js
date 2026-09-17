import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authorizeUrl } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/strava/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const res = NextResponse.redirect(authorizeUrl(redirectUri, state));
  res.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
