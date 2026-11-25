import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserByEmail, getUserById, updateUserPassword, bumpSessionVersion, friendlyDbErrorMessage } from "@/lib/db";
import { isValidPassword, PASSWORD_REQUIREMENTS_TEXT, hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, createSession, sessionCookieOptions, isFreshSession } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const limited = await rateLimit([{ key: `chgpw:user:${session.userId}`, limit: 10, windowSeconds: 15 * 60 }]);
  if (limited) return limited;

  const { currentPassword, newPassword, confirmPassword } = await request.json().catch(() => ({}));
  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ error: "weak_password", message: PASSWORD_REQUIREMENTS_TEXT }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "password_mismatch", message: "New passwords don't match." }, { status: 400 });
  }

  try {
    // Look the user up by primary key via their session, not by trusting client input.
    const user = await getUserById(session.userId);
    const withHash = await getUserByEmail(user.email);

    if (withHash.password_hash) {
      const { ok } = await verifyPassword(currentPassword, withHash.password_hash);
      if (!ok) {
        return NextResponse.json({ error: "wrong_password", message: "Current password is incorrect." }, { status: 401 });
      }
    } else if (!isFreshSession(session)) {
      // Google-only accounts have no password to re-enter, so require a
      // recent sign-in instead — a stolen older cookie can't set one.
      return NextResponse.json(
        { error: "reauth_required", message: "For your security, sign out and sign in again, then set your password." },
        { status: 401 }
      );
    }

    await updateUserPassword(session.userId, await hashPassword(newPassword));
    // Sign out every other device; keep this one by re-issuing its cookie.
    const version = await bumpSessionVersion(session.userId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSession(session.userId, version), sessionCookieOptions());
    return res;
  } catch (e) {
    console.error("Failed to change password:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
