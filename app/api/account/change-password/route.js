import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, getUserByEmail, updateUserPassword, friendlyDbErrorMessage } from "@/lib/db";
import { isValidPassword, PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

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
      if (!currentPassword || !(await bcrypt.compare(currentPassword, withHash.password_hash))) {
        return NextResponse.json({ error: "wrong_password", message: "Current password is incorrect." }, { status: 401 });
      }
    }
    // Accounts created via Google with no password yet can set one without a "current password".

    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(session.userId, hash);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to change password:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
