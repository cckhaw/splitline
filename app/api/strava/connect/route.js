import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { EncryptJWT } from "jose";
import { authorizeUrl, platformCredentials } from "@/lib/strava";
import { getSessionUser } from "@/lib/authGuard";

export const runtime = "nodejs";

function pendingKey() {
  const s = process.env.SESSION_SECRET;
  return new TextEncoder().encode(s.slice(0, 32).padEnd(32, "0"));
}

// POST so a "bring your own app" client secret never travels in a URL —
// it goes in the request body over TLS, then straight into a short-lived
// encrypted cookie. The client follows the returned authorizeUrl itself.
export async function POST(request) {
  const url = new URL(request.url);
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ownClientId = body.clientId?.trim() || null;
  const ownClientSecret = body.clientSecret?.trim() || null;
  if ((ownClientId && !ownClientSecret) || (!ownClientId && ownClientSecret)) {
    return NextResponse.json({ error: "incomplete_credentials", message: "Provide both a client ID and a client secret, or neither." }, { status: 400 });
  }

  const { clientId: platformId } = platformCredentials();
  const clientId = ownClientId || platformId;
  if (!clientId) {
    return NextResponse.json({ error: "not_configured", message: "No Strava app is configured for this deployment yet." }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${url.origin}/api/strava/callback`;

  const pending = await new EncryptJWT({ state, ownClientId, ownClientSecret })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime("10m")
    .encrypt(pendingKey());

  const res = NextResponse.json({ authorizeUrl: authorizeUrl(redirectUri, state, clientId) });
  res.cookies.set("strava_pending", pending, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
