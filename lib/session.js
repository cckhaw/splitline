// A signed, encrypted cookie holding an opaque user id plus the user's
// session_version at issue time (see lib/authGuard.js, which rejects the
// cookie once the version has been bumped — that is how sessions are
// revoked server-side). jose's JWE is used for simplicity and because
// it's already a dependency.

import { EncryptJWT, jwtDecrypt } from "jose";
import { deriveKey } from "./keys.js";

const AUD = "splitline:user";
const TYP = "session";

export async function createSession(userId, sessionVersion = 0) {
  return await new EncryptJWT({ uid: userId, sv: sessionVersion || 0, typ: TYP })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("60d")
    .encrypt(deriveKey("session"));
}

// -> { userId, sv, iat } | null
export async function readSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, deriveKey("session"), { audience: AUD });
    if (!payload.uid || payload.typ !== TYP) return null;
    return { userId: payload.uid, sv: payload.sv || 0, iat: payload.iat || 0 };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "splitline_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" };
}

// "Recent sign-in" check for sensitive actions on accounts that have no
// password to re-enter (Google-only).
export const FRESH_SESSION_SECONDS = 10 * 60;
export function isFreshSession(session) {
  return Boolean(session?.iat) && Date.now() / 1000 - session.iat < FRESH_SESSION_SECONDS;
}
