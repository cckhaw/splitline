import { NextResponse } from "next/server";
import { getUserByEmail, friendlyDbErrorMessage } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";

export const runtime = "nodejs";

// Only handles the signup-verification code; email-change codes are
// reissued via /api/account/change-email/request instead.
export async function POST(request) {
  const { email } = await request.json().catch(() => ({}));

  try {
    const user = await getUserByEmail(email || "");
    // Don't reveal whether an account exists for this address.
    if (!user || user.email_verified) return NextResponse.json({ ok: true });

    await issueVerificationCode(user.id, "signup_email", user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Resend code failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
