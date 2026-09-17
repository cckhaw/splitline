import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { updateUserWeight, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

const MIN_KG = 25;
const MAX_KG = 250;

// Self-reported body weight — Strava's API doesn't expose this either, so
// it's the only way the Equipment Lifecycle panel can scale a shoe's
// estimated midsole lifespan for the athlete's own impact (see
// lib/equipment.js). Entirely optional: without it, shoe wear falls back
// to the unscaled baseline threshold.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { weightKg } = await request.json().catch(() => ({}));
  const parsed = Number(weightKg);
  if (!Number.isFinite(parsed) || parsed < MIN_KG || parsed > MAX_KG) {
    return NextResponse.json({ error: "invalid_weight", message: `Enter a weight between ${MIN_KG} and ${MAX_KG} kg.` }, { status: 400 });
  }

  try {
    await updateUserWeight(session.userId, parsed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to update weight:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
