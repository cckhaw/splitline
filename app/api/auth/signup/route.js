import { NextResponse } from "next/server";
import { createUser, getUserByEmail, updateUserName, updateUserPassword, updateUserBirthDate, bumpSessionVersion, friendlyDbErrorMessage } from "@/lib/db";
import { issueVerificationCode } from "@/lib/verification";
import { ageFromBirthDate } from "@/lib/insights";
import { betaSignupTierGrant } from "@/lib/membership";
import { isValidPassword, PASSWORD_REQUIREMENTS_TEXT, hashPassword } from "@/lib/password";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { requireTurnstile } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const MIN_SIGNUP_AGE = 13; // blocks age 12 and below

export async function POST(request) {
  const { name, email, password, confirmPassword, birthDate, captchaToken } = await request.json().catch(() => ({}));

  const limited = await rateLimit([
    { key: `signup:ip:${clientIp(request)}`, limit: 10, windowSeconds: 60 * 60 },
    { key: "signup:global", limit: 500, windowSeconds: 60 * 60 },
  ]);
  if (limited) return limited;
  const captcha = await requireTurnstile(request, captchaToken);
  if (captcha) return captcha;

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
      // Same response as a fresh signup so this endpoint can't be used to
      // probe which emails are registered; the real owner is told by email.
      try {
        await sendEmail({
          to: existing.email,
          subject: "Someone tried to create a Splitline account with your email",
          text:
            "Someone just tried to sign up for Splitline using this email address, but you already have an account.\n\n" +
            "If that was you, just log in (or use \"Forgot password\" on the login page). If it wasn't, you can ignore this message — nothing has changed.",
        });
      } catch (e) {
        console.error("Failed to send existing-account notice:", e);
      }
      return NextResponse.json({ ok: true, needsVerification: true, email: existing.email });
    }

    const hash = await hashPassword(password);
    let user;
    if (existing) {
      // Unverified account from a previous, abandoned signup attempt — pick it back up.
      await updateUserName(existing.id, name.trim());
      await updateUserPassword(existing.id, hash);
      await updateUserBirthDate(existing.id, birthDate);
      await bumpSessionVersion(existing.id); // nothing issued for the old attempt stays valid
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
