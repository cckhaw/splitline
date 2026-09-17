import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail, updateUserName, updateUserPassword, updateUserBirthDate, friendlyDbErrorMessage } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";
import { ageFromBirthDate } from "@/lib/insights";
import { betaSignupTierGrant } from "@/lib/membership";
import { isValidPassword, PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password";

export const runtime = "nodejs";

const MIN_SIGNUP_AGE = 13; // blocks age 12 and below

export async function POST(request) {
  const { name, email, password, confirmPassword, birthDate } = await request.json().catch(() => ({}));

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "missing_name", message: "Enter your full name." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email", message: "Enter a valid email address." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "weak_password", message: PASSWORD_REQUIREMENTS_TEXT }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "password_mismatch", message: "Passwords don't match." }, { status: 400 });
  }

  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json({ error: "invalid_birthdate", message: "Enter your date of birth." }, { status: 400 });
  }
  const parsedBirthDate = new Date(birthDate);
  const now = new Date();
  if (Number.isNaN(parsedBirthDate.getTime()) || parsedBirthDate > now || now.getFullYear() - parsedBirthDate.getFullYear() > 120) {
    return NextResponse.json({ error: "invalid_birthdate", message: "Enter a valid date of birth." }, { status: 400 });
  }
  const age = ageFromBirthDate(birthDate, now);
  if (age < MIN_SIGNUP_AGE) {
    return NextResponse.json(
      { error: "too_young", message: `You must be at least ${MIN_SIGNUP_AGE} years old to create a Splitline account.` },
      { status: 403 }
    );
  }

  try {
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
      await updateUserBirthDate(existing.id, birthDate);
      user = existing;
    } else {
      user = await createUser(name.trim(), email, hash, { birthDate, ...betaSignupTierGrant() });
    }
    await issueVerificationCode(user.id, "signup_email", user.email);

    return NextResponse.json({ ok: true, needsVerification: true, email: user.email });
  } catch (e) {
    console.error("Signup failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
