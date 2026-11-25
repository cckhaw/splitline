import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, getUserByEmail, friendlyDbErrorMessage } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";
import { verifyPassword } from "@/lib/password";
import { isFreshSession } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const limited = await rateLimit([{ key: `chgemail:user:${session.userId}`, limit: 8, windowSeconds: 60 * 60 }]);
  if (limited) return limited;

  const { newEmail, currentPassword } = await request.json().catch(() => ({}));
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "invalid_email", message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const user = await getUserById(session.userId);
    const normalized = newEmail.toLowerCase().trim();

    // Changing the email is an account-takeover primitive (it feeds
    // "forgot password"), so a stolen session alone must not be enough.
    const withHash = await getUserByEmail(user.email);
    if (withHash.password_hash) {
      const { ok } = await verifyPassword(currentPassword, withHash.password_hash);
      if (!ok) {
        return NextResponse.json({ error: "wrong_password", message: "Current password is incorrect." }, { status: 401 });
      }
    } else if (!isFreshSession(session)) {
      return NextResponse.json(
        { error: "reauth_required", message: "For your security, sign out and sign in again with Google, then change your email." },
        { status: 401 }
      );
    }

    if (normalized === user.email) {
      return NextResponse.json({ error: "same_email", message: "That's already your email." }, { status: 400 });
    }
    const existing = await getUserByEmail(normalized);
    if (existing) {
      return NextResponse.json({ error: "email_taken", message: "Another account already uses that email." }, { status: 409 });
    }

    // The code is sent to the *new* address — that's what proves the user controls it.
    await issueVerificationCode(session.userId, "change_email", normalized, normalized);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to request email change:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
