// A completely separate session mechanism from lib/session.js's user
// sessions — different cookie name, different payload shape ({admin:true}
// vs {uid}), and there is no user row or signup/login path that can ever
// produce one. The only way to get an admin session is /api/admin/login
// with the ADMIN_USERNAME/ADMIN_PASSWORD env vars, so a normal user
// account (however it was created) can never become an admin session.
// Reuses SESSION_SECRET rather than requiring a second secret env var —
// the cookie name and payload shape already keep the two session kinds
// from ever being confused with each other.

import { EncryptJWT, jwtDecrypt } from "jose";

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it in your environment to a " +
      "random string of at least 32 characters (e.g. `openssl rand -base64 32`)."
    );
  }
  return new TextEncoder().encode(s.slice(0, 32).padEnd(32, "0"));
}

export async function createAdminSession() {
  return await new EncryptJWT({ admin: true })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .encrypt(secretKey());
}

export async function readAdminSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, secretKey());
    return payload.admin === true ? { admin: true } : null;
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_COOKIE = "splitline_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours — shorter-lived than user sessions on purpose
