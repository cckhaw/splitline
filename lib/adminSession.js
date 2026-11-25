// A completely separate session mechanism from lib/session.js's user
// sessions — different cookie name, different payload shape ({admin:true}
// vs {uid}), and there is no user row or signup/login path that can ever
// produce one. The only way to get an admin session is /api/admin/login
// with the ADMIN_USERNAME/ADMIN_PASSWORD env vars, so a normal user
// account (however it was created) can never become an admin session.
// Uses its own HKDF-derived key (lib/keys.js) and audience, so the two
// session kinds can't be confused even though they share SESSION_SECRET.

import { EncryptJWT, jwtDecrypt } from "jose";
import { deriveKey } from "./keys.js";

const AUD = "splitline:admin";

export async function createAdminSession() {
  return await new EncryptJWT({ admin: true, typ: "admin" })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("12h")
    .encrypt(deriveKey("admin-session"));
}

export async function readAdminSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, deriveKey("admin-session"), { audience: AUD });
    return payload.admin === true && payload.typ === "admin" ? { admin: true } : null;
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_COOKIE = "splitline_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours — shorter-lived than user sessions on purpose
