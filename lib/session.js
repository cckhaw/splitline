// The cookie no longer carries Strava tokens (those moved to the
// database so imports and overlays survive across devices and logins).
// It's now just a signed, opaque user id — encryption is unnecessary
// once there's no secret inside, but we keep using jose's JWE for
// simplicity and because it's already a dependency.

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

export async function createSession(userId) {
  return await new EncryptJWT({ uid: userId })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("60d")
    .encrypt(secretKey());
}

export async function readSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, secretKey());
    return payload.uid ? { userId: payload.uid } : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "splitline_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days
