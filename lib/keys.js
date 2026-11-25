// Purpose-separated keys derived (HKDF-SHA256) from SESSION_SECRET, so a
// token minted for one purpose can never decrypt as another's. The full
// secret is used (no truncation/padding).

import crypto from "node:crypto";

export function deriveKey(purpose) {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it in your environment to a " +
      "random string of at least 32 characters (e.g. `openssl rand -base64 32`)."
    );
  }
  return new Uint8Array(crypto.hkdfSync("sha256", s, "splitline", `splitline:${purpose}:v1`, 32));
}
