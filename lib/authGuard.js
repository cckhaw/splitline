import { readSession, SESSION_COOKIE } from "./session.js";
import { getSessionVersion } from "./db.js";

// -> { userId, sv, iat } or null. Besides decrypting the cookie, checks
// the user still exists and the cookie's session_version is current, so
// a password change/reset, email change or "sign out everywhere" kills
// every older session immediately.
export async function getSessionUser(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSession(token);
  if (!session) return null;
  const current = await getSessionVersion(session.userId);
  if (current === null || current !== session.sv) return null;
  return session;
}
