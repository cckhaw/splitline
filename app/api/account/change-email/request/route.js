import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, getUserByEmail, friendlyDbErrorMessage } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { newEmail } = await request.json().catch(() => ({}));
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "invalid_email", message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const user = await getUserById(session.userId);
    const normalized = newEmail.toLowerCase().trim();
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
