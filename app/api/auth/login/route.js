import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  const { email, password } = await request.json().catch(() => ({}));
  const user = await getUserByEmail(email || "");

  if (!user || !user.password_hash || !(await bcrypt.compare(password || "", user.password_hash))) {
    return NextResponse.json({ error: "invalid_credentials", message: "Wrong email or password." }, { status: 401 });
  }
  if (!user.email_verified) {
    return NextResponse.json({ error: "email_unverified", message: "Verify your email before logging in.", email: user.email }, { status: 403 });
  }

  const token = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });
  return res;
}
