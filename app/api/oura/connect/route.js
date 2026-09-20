import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authorizeUrl, platformCredentials } from "@/lib/oura";
import { getSessionUser } from "@/lib/authGuard";

export const runtime = "nodejs";

// Simpler than /api/strava/connect's — no "bring your own app" option,
// so there's no client secret to hide in an encrypted cookie. The state
// value alone (httpOnly, short-lived) is enough to guard against CSRF on
// the callback.
export async function POST(request) {
  const url = new URL(request.url);
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { clientId } = platformCredentials();
  if (!clientId) {
    return NextResponse.json({ error: "not_configured", message: "Oura Ring isn't configured for this deployment yet." }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${url.origin}/api/oura/callback`;

  const res = NextResponse.json({ authorizeUrl: authorizeUrl(redirectUri, state, clientId) });
  res.cookies.set("oura_pending_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
