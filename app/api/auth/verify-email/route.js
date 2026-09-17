import { NextResponse } from "next/server";
import { getUserByEmail, setEmailVerified } from "@/lib/db";
import { checkVerificationCode } from "@/lib/verification";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

const ERROR_MESSAGES = {
  no_pending_code: "Request a new code first.",
  expired: "That code expired — request a new one.",
  too_many_attempts: "Too many wrong attempts — request a new code.",
  incorrect_code: "That code isn't right.",
};

// Confirms a brand-new signup's email address, then logs them in.
// Email-change confirmation (for an already-logged-in user) is handled
// separately by /api/account/change-email/confirm.
export async function POST(request) {
  const { email, code } = await request.json().catch(() => ({}));
  const user = await getUserByEmail(email || "");
  if (!user) return NextResponse.json({ error: "not_found", message: "No account with that email." }, { status: 404 });

  const result = await checkVerificationCode(user.id, "signup_email", code);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: ERROR_MESSAGES[result.error] || "Couldn't verify that code." },
      { status: 400 }
    );
  }

  await setEmailVerified(user.id);

  const token = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });
  return res;
}
