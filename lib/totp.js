// Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s) for the optional admin
// second factor. Set ADMIN_TOTP_SECRET to a base32 secret (e.g. generated
// by `openssl rand 20 | base32`) and add the same secret to an
// authenticator app. ±1 step of clock drift is accepted.

import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secret).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(base32Secret, token, now = Date.now()) {
  const t = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  const secret = base32Decode(base32Secret);
  const step = Math.floor(now / 30000);
  let ok = false;
  for (const d of [-1, 0, 1]) {
    const expected = hotp(secret, step + d);
    // no early exit: constant work regardless of which step matched
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(t))) ok = true;
  }
  return ok;
}
