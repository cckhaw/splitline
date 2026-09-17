import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { updateUserEmail } from "@/lib/db";
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

  const { code } = await request.json().catch(() => ({}));
  const result = await checkVerificationCode(session.userId, "change_email", code);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: ERROR_MESSAGES[result.error] || "Couldn't verify that code." },
      { status: 400 }
    );
  }

  await updateUserEmail(session.userId, result.newEmail);
  return NextResponse.json({ ok: true, email: result.newEmail });
}
