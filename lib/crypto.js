// AES-256-GCM for anything sensitive that has to live in a row, not a
// cookie: Strava access/refresh tokens, and a user's own Strava client
// secret if they opt into "bring your own app". Distinct from
// lib/session.js's JWE, which only ever holds an opaque user id now.

import crypto from "node:crypto";

function key() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY is missing or too short. Set it in your environment to a " +
      "random string of at least 32 characters (e.g. `openssl rand -base64 32`)."
    );
  }
  return crypto.createHash("sha256").update(k).digest(); // 32 bytes
}

export function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload) {
  if (payload == null) return null;
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
