import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { updateUserBirthDate, friendlyDbErrorMessage } from "@/lib/db";
import { ageFromBirthDate } from "@/lib/insights";

export const runtime = "nodejs";

const MIN_AGE = 13; // same floor enforced at signup — see app/api/auth/signup/route.js

// Self-reported date of birth — Strava's public API doesn't expose this,
// so it's the only way the injury-risk estimate can factor in age.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { birthDate } = await request.json().catch(() => ({}));
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json({ error: "invalid_date", message: "Enter a valid date." }, { status: 400 });
  }
  const parsed = new Date(birthDate);
  const now = new Date();
  if (Number.isNaN(parsed.getTime()) || parsed > now || now.getFullYear() - parsed.getFullYear() > 120) {
    return NextResponse.json({ error: "invalid_date", message: "Enter a valid date of birth." }, { status: 400 });
  }
  if (ageFromBirthDate(birthDate, now) < MIN_AGE) {
    return NextResponse.json({ error: "too_young", message: `Splitline accounts require an age of at least ${MIN_AGE}.` }, { status: 403 });
  }

  try {
    await updateUserBirthDate(session.userId, birthDate);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to update birth date:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
