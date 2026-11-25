import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { updateUserEmail, bumpSessionVersion, friendlyDbErrorMessage } from "@/lib/db";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { checkVerificationCode } from "@/lib/verification";

export const runtime = "nodejs";

const ERROR_MESSAGES = {
  no_pending_code: "Request a new code first.",
  expired: "That code expired — request a new one.",
  too_many_attempts: "Too many wrong attempts — request a new code.",
  incorrect_code: "That code isn't right.",
};

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const limited = await rateLimit([{ key: `chgemail-confirm:user:${session.userId}`, limit: 20, windowSeconds: 60 * 60 }]);
  if (limited) return limited;

  const { code } = await request.json().catch(() => ({}));

  try {
    const result = await checkVerificationCode(session.userId, "change_email", code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: ERROR_MESSAGES[result.error] || "Couldn't verify that code." },
        { status: 400 }
      );
    }

    await updateUserEmail(session.userId, result.newEmail);
    const version = await bumpSessionVersion(session.userId); // sign out other devices
    const res = NextResponse.json({ ok: true, email: result.newEmail });
    res.cookies.set(SESSION_COOKIE, await createSession(session.userId, version), sessionCookieOptions());
    return res;
  } catch (e) {
    console.error("Failed to confirm email change:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
