import { NextResponse } from "next/server";
import { exchangeCode, getUserInfo } from "@/lib/google";
import { getUserByGoogleId, getUserByEmail, createUser, linkGoogleId, takeOverUnverifiedAccount } from "@/lib/db";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
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
    // Never sign in or link by an email Google hasn't verified: anyone can
    // attach someone else's address to a Google account without proving it.
    if (profile.email_verified !== true) return fail("google_email_unverified");

    let user = await getUserByGoogleId(profile.sub);
    let isNewUser = false;
    if (!user) {
      const existing = await getUserByEmail(profile.email);
      if (existing) {
        if (existing.email_verified) {
          await linkGoogleId(existing.id, profile.sub);
        } else {
          // The account was created (with someone's chosen password) but
          // its email never verified. Google has now proven the real owner
          // controls this address, so drop that password and every
          // existing session before taking the account over — otherwise
          // whoever pre-registered the email keeps access.
          await takeOverUnverifiedAccount(existing.id, profile.sub);
          existing.session_version = (existing.session_version || 0) + 1;
        }
        user = existing;
      } else {
        // Google's basic profile scope doesn't include date of birth, so
        // the under-13 signup block can't be enforced here — new Google
        // accounts are instead nudged to add it on the account page.
        user = await createUser(profile.name || profile.email, profile.email, null, {
          emailVerified: true,
          googleId: profile.sub,
          ...betaSignupTierGrant(),
        });
        isNewUser = true;
      }
    }

    const token = await createSession(user.id, user.session_version);
    const res = NextResponse.redirect(`${url.origin}${isNewUser ? "/account?prompt=birthdate" : "/app"}`);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return fail("google_auth_failed");
  }
}
