import { NextResponse } from "next/server";
import { exchangeCode, getPersonalInfo, platformCredentials } from "@/lib/oura";
import { getSessionUser } from "@/lib/authGuard";
import { saveOuraConnection } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const session = await getSessionUser(request);
  if (!session) return NextResponse.redirect(`${url.origin}/login`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const pendingState = request.cookies.get("oura_pending_state")?.value;

  if (error) return NextResponse.redirect(`${url.origin}/app?oura_error=${encodeURIComponent(error)}`);
  if (!code || !state || !pendingState || state !== pendingState) {
    return NextResponse.redirect(`${url.origin}/app?oura_error=state_mismatch`);
  }

  const { clientId, clientSecret } = platformCredentials();
  const redirectUri = `${url.origin}/api/oura/callback`;

  try {
    const token = await exchangeCode(code, redirectUri, clientId, clientSecret);
    const expiresAt = Math.floor(Date.now() / 1000) + Number(token.expires_in || 0);

    // Best-effort — a failure here shouldn't block the connection itself,
    // since oura_user_id is only kept for reference and isn't used by
    // anything else in the app.
    let ouraUserId = null;
    try {
      const info = await getPersonalInfo(token.access_token);
      ouraUserId = info?.id || null;
    } catch (e) {
      console.error("Failed to fetch Oura personal_info (continuing without it):", e);
    }

    await saveOuraConnection(session.userId, {
      ouraUserId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
    });
    const res = NextResponse.redirect(`${url.origin}/app?oura_connected=1`);
    res.cookies.delete("oura_pending_state");
    return res;
  } catch (e) {
    console.error("Oura token exchange failed:", e);
    return NextResponse.redirect(`${url.origin}/app?oura_error=token_exchange_failed`);
  }
}
