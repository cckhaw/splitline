import { NextResponse } from "next/server";
import { jwtDecrypt } from "jose";
import { exchangeCode, platformCredentials } from "@/lib/strava";
import { getSessionUser } from "@/lib/authGuard";
import { saveStravaConnection } from "@/lib/db";

export const runtime = "nodejs";

function pendingKey() {
  const s = process.env.SESSION_SECRET;
  return new TextEncoder().encode(s.slice(0, 32).padEnd(32, "0"));
}

export async function GET(request) {
  const url = new URL(request.url);
  const session = await getSessionUser(request);
  if (!session) return NextResponse.redirect(`${url.origin}/login`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const pendingCookie = request.cookies.get("strava_pending")?.value;

  if (error) return NextResponse.redirect(`${url.origin}/app?strava_error=${encodeURIComponent(error)}`);

  let pending;
  try {
    const { payload } = await jwtDecrypt(pendingCookie, pendingKey());
    pending = payload;
  } catch {
    return NextResponse.redirect(`${url.origin}/app?strava_error=state_mismatch`);
  }
  if (!code || !state || state !== pending.state) {
    return NextResponse.redirect(`${url.origin}/app?strava_error=state_mismatch`);
  }

  const { clientId: platformId, clientSecret: platformSecret } = platformCredentials();
  const clientId = pending.ownClientId || platformId;
  const clientSecret = pending.ownClientSecret || platformSecret;

  try {
    const token = await exchangeCode(code, clientId, clientSecret);
    await saveStravaConnection(session.userId, {
      athleteId: token.athlete?.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_at,
      ownClientId: pending.ownClientId || null,
      ownClientSecret: pending.ownClientSecret || null,
    });
    const res = NextResponse.redirect(`${url.origin}/app`);
    res.cookies.delete("strava_pending");
    return res;
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/app?strava_error=token_exchange_failed`);
  }
}
