import { NextResponse } from "next/server";
import { getUserByEmail, updateUserPassword, bumpSessionVersion, friendlyDbErrorMessage } from "@/lib/db";
import { checkVerificationCode } from "@/lib/verification";
import { isValidPassword, PASSWORD_REQUIREMENTS_TEXT, hashPassword } from "@/lib/password";
import { rateLimit, clientIp, idKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

const ERROR_MESSAGES = {
  no_pending_code: "That code is incorrect or has expired.",
  expired: "That code has expired — request a new one.",
  too_many_attempts: "Too many incorrect attempts — request a new code.",
  incorrect_code: "That code isn't right.",
};

export async function POST(request) {
  const { email, code, newPassword, confirmPassword } = await request.json().catch(() => ({}));
  if (!email || !code) {
    return NextResponse.json({ error: "missing_fields", message: "Missing email or code." }, { status: 400 });
  }
  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ error: "weak_password", message: PASSWORD_REQUIREMENTS_TEXT }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "password_mismatch", message: "New passwords don't match." }, { status: 400 });
  }

  const limited = await rateLimit([
    { key: `reset:ip:${clientIp(request)}`, limit: 30, windowSeconds: 60 * 60 },
    { key: `reset:acct:${idKey(email)}`, limit: 20, windowSeconds: 60 * 60 },
  ]);
  if (limited) return limited;

  try {
    const user = await getUserByEmail(email);
    // Same "incorrect code" response whether the address has no account
    // or the code is simply wrong — don't let this endpoint confirm
    // which emails are registered.
    if (!user) {
      return NextResponse.json({ error: "no_pending_code", message: ERROR_MESSAGES.no_pending_code }, { status: 400 });
    }

    const result = await checkVerificationCode(user.id, "password_reset", code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: ERROR_MESSAGES[result.error] || "Couldn't reset your password." },
        { status: 400 }
      );
    }

    const hash = await hashPassword(newPassword);
    await updateUserPassword(user.id, hash);
    await bumpSessionVersion(user.id); // sign out every device that had the old password
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to reset password:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
