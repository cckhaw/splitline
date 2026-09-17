import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail, updateUserName, updateUserPassword } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";

export const runtime = "nodejs";

export async function POST(request) {
  const { name, email, password, confirmPassword } = await request.json().catch(() => ({}));

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "missing_name", message: "Enter your full name." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email", message: "Enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "weak_password", message: "Password needs to be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "password_mismatch", message: "Passwords don't match." }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing && existing.email_verified) {
    return NextResponse.json({ error: "email_taken", message: "An account with that email already exists." }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 10);
  let user;
  if (existing) {
    // Unverified account from a previous, abandoned signup attempt — pick it back up.
    await updateUserName(existing.id, name.trim());
    await updateUserPassword(existing.id, hash);
    user = existing;
  } else {
    user = await createUser(name.trim(), email, hash);
  }
  await issueVerificationCode(user.id, "signup_email", user.email);

  return NextResponse.json({ ok: true, needsVerification: true, email: user.email });
}
