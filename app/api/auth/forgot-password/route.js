import { NextResponse } from "next/server";
import { getUserByEmail, friendlyDbErrorMessage } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";
import { rateLimit, clientIp, idKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Always responds the same way whether or not the address has an
// account — otherwise this endpoint would let anyone probe which emails
// are registered with Splitline.
export async function POST(request) {
  const { email } = await request.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "missing_email", message: "Enter your email address." }, { status: 400 });

  const limited = await rateLimit([
    { key: `forgot:ip:${clientIp(request)}`, limit: 10, windowSeconds: 60 * 60 },
    { key: `forgot:acct:${idKey(email)}`, limit: 5, windowSeconds: 60 * 60 },
  ]);
  if (limited) return limited;

  try {
    const user = await getUserByEmail(email);
    if (user) {
      await issueVerificationCode(user.id, "password_reset", user.email);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to issue password reset code:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
