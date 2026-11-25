// Centralized password policy — signup and password-change both import
// this so the rule can't drift between the two check sites.
export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_REQUIREMENTS_TEXT =
  "Password needs to be at least 12 characters, with at least one uppercase letter, one lowercase letter, one number, and one symbol.";

export function isValidPassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

// ---- hashing ----
// bcrypt cost 12 (OWASP guidance). Existing cost-10 hashes keep working
// and are transparently upgraded the next time that user logs in.
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

// A real hash of a random string, computed once. Comparing against it for
// unknown accounts makes "no such user" cost the same as "wrong password".
let dummyHash;
function dummy() {
  return (dummyHash ||= bcrypt.hashSync(`dummy-${Math.random()}-${Date.now()}`, BCRYPT_COST));
}

// -> { ok, needsRehash }. `hash` may be null/undefined (unknown user or a
// Google-only account); the comparison is still performed for timing.
export async function verifyPassword(password, hash) {
  const target = hash || dummy();
  const ok = await bcrypt.compare(String(password || ""), target);
  if (!hash) return { ok: false, needsRehash: false };
  return { ok, needsRehash: ok && bcrypt.getRounds(hash) < BCRYPT_COST };
}
