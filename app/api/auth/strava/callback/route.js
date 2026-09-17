import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/strava";
import { encryptSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const expectedState = request.cookies.get("strava_oauth_state")?.value;

  if (error) return NextResponse.redirect(`${url.origin}/?strava_error=${encodeURIComponent(error)}`);
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${url.origin}/?strava_error=state_mismatch`);
  }

  try {
    const token = await exchangeCode(code);
    const session = await encryptSession({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
      athlete_id: token.athlete?.id,
    });

    const res = NextResponse.redirect(`${url.origin}/`);
    res.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    res.cookies.delete("strava_oauth_state");
    return res;
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/?strava_error=token_exchange_failed`);
  }
}
