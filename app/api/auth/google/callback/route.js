import { NextResponse } from "next/server";
import { exchangeCode, getUserInfo } from "@/lib/google";
import { getUserByGoogleId, getUserByEmail, createUser, linkGoogleId, setEmailVerified } from "@/lib/db";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { betaSignupTierGrant } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;

  function fail(error) {
    const res = NextResponse.redirect(`${url.origin}/login?error=${error}`);
    res.cookies.delete("google_oauth_state");
    return res;
  }

  if (url.searchParams.get("error")) return fail("google_access_denied");
  if (!code || !state || state !== expectedState) return fail("state_mismatch");

  try {
    const redirectUri = `${url.origin}/api/auth/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    const profile = await getUserInfo(tokens.access_token);
    if (!profile.email) return fail("google_no_email");

    let user = await getUserByGoogleId(profile.sub);
    let isNewUser = false;
    if (!user) {
      const existing = await getUserByEmail(profile.email);
      if (existing) {
        await linkGoogleId(existing.id, profile.sub);
        if (!existing.email_verified && profile.email_verified) await setEmailVerified(existing.id);
        user = existing;
      } else {
        // Google's basic profile scope doesn't include date of birth, so
        // the under-13 signup block can't be enforced here — new Google
        // accounts are instead nudged to add it on the account page.
        user = await createUser(profile.name || profile.email, profile.email, null, {
          emailVerified: Boolean(profile.email_verified),
          googleId: profile.sub,
          ...betaSignupTierGrant(),
        });
        isNewUser = true;
      }
    }

    const token = await createSession(user.id);
    const res = NextResponse.redirect(`${url.origin}${isNewUser ? "/account?prompt=birthdate" : "/app"}`);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return fail("google_auth_failed");
  }
}
