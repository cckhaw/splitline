// Six-digit email verification codes: used both for confirming a new
// signup's email address and for confirming an email change. Codes are
// hashed at rest (sha256 is fine here — short-lived, single-use, and
// rate-limited by MAX_ATTEMPTS, not a password) and expire quickly.

import crypto from "node:crypto";
import { createVerificationCode, getActiveVerificationCode, incrementVerificationAttempts, consumeVerificationCode } from "./db.js";
import { sendEmail, verificationEmailText } from "./email.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// purpose: 'signup_email' | 'change_email'. `email` is where the code is
// sent — the user's current email for signup, the pending new address
// for a change.
export async function issueVerificationCode(userId, purpose, email, newEmail = null) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await createVerificationCode(userId, purpose, hashCode(code), expiresAt, newEmail);
  await sendEmail({
    to: email,
    subject: "Your Splitline verification code",
    text: verificationEmailText(code, { purpose, newEmail }),
  });
  return { expiresAt };
}

// Returns { ok: true, newEmail } on success, or { ok: false, error } on failure.
export async function checkVerificationCode(userId, purpose, code) {
  const row = await getActiveVerificationCode(userId, purpose);
  if (!row) return { ok: false, error: "no_pending_code" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "too_many_attempts" };

  if (row.code_hash !== hashCode(String(code || "").trim())) {
    await incrementVerificationAttempts(row.id);
    return { ok: false, error: "incorrect_code" };
  }
  await consumeVerificationCode(row.id);
  return { ok: true, newEmail: row.new_email };
}
