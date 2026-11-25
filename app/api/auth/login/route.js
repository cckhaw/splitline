import { NextResponse } from "next/server";
import { getUserByEmail, updateUserPassword, friendlyDbErrorMessage } from "@/lib/db";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { trackEvent } from "@/lib/usageEvents";
import { verifyPassword, hashPassword } from "@/lib/password";
import { rateLimit, clientIp, idKey } from "@/lib/rateLimit";
import { requireTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

export async function POST(request) {
  const { email, password, captchaToken } = await request.json().catch(() => ({}));

  const limited = await rateLimit([
    { key: `login:ip:${clientIp(request)}`, limit: 30, windowSeconds: 15 * 60 },
    { key: `login:acct:${idKey(email)}`, limit: 10, windowSeconds: 15 * 60 },
  ]);
  if (limited) return limited;
  const captcha = await requireTurnstile(request, captchaToken);
  if (captcha) return captcha;

  try {
    const user = await getUserByEmail(String(email || ""));

    // Always runs one bcrypt compare (against a dummy hash for unknown /
    // Google-only accounts) so response time doesn't reveal which emails exist.
    const { ok, needsRehash } = await verifyPassword(password, user?.password_hash);
    if (!user || !ok) {
      return NextResponse.json({ error: "invalid_credentials", message: "Wrong email or password." }, { status: 401 });
    }
    if (!user.email_verified) {
      return NextResponse.json({ error: "email_unverified", message: "Verify your email before logging in.", email: user.email }, { status: 403 });
    }
    if (needsRehash) {
      try { await updateUserPassword(user.id, await hashPassword(password)); } catch (e) { console.error("rehash failed:", e); }
    }

    trackEvent(request, user.id, "login");

    const token = await createSession(user.id, user.session_version);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    console.error("Login failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
