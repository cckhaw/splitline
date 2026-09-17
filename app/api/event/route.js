import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getRaceGoal, saveRaceGoal, deleteRaceGoal } from "@/lib/db";

export const runtime = "nodejs";

const EVENT_TYPES = ["running", "duathlon", "triathlon"];
const MIN_WEEKS_OUT = 4;

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const goal = await getRaceGoal(session.userId);
  return NextResponse.json({ goal });
}

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { eventType, eventName, eventDate, targetDistance } = await request.json().catch(() => ({}));

  if (!EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: "invalid_type", message: "Choose running, duathlon, or triathlon." }, { status: 400 });
  }
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: "invalid_date", message: "Enter a valid event date." }, { status: 400 });
  }
  const parsed = new Date(eventDate);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "invalid_date", message: "Enter a valid event date." }, { status: 400 });
  }
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + MIN_WEEKS_OUT * 7);
  if (parsed < minDate) {
    return NextResponse.json(
      { error: "too_soon", message: `The event needs to be at least ${MIN_WEEKS_OUT} weeks away so there's time for a training plan.` },
      { status: 400 }
    );
  }

  await saveRaceGoal(session.userId, {
    eventType,
    eventName: eventName?.trim() || null,
    eventDate,
    targetDistance: targetDistance?.trim() || null,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  await deleteRaceGoal(session.userId);
  return NextResponse.json({ ok: true });
}
