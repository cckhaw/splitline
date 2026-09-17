import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { updateUserBirthDate } from "@/lib/db";

export const runtime = "nodejs";

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

  await updateUserBirthDate(session.userId, birthDate);
  return NextResponse.json({ ok: true });
}
