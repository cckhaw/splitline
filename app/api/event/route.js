import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getRaceGoal, saveRaceGoal, deleteRaceGoal } from "@/lib/db";
import { DISTANCE_OPTIONS } from "@/lib/eventTypes";

export const runtime = "nodejs";

const MIN_WEEKS_OUT = 4;

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const goal = await getRaceGoal(session.userId);
    return NextResponse.json({ goal });
  } catch (e) {
    console.error("Failed to load race goal:", e);
    return NextResponse.json({ error: "server_error", message: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { eventType, eventName, eventDate, targetDistance } = await request.json().catch(() => ({}));

  if (!Object.keys(DISTANCE_OPTIONS).includes(eventType)) {
    return NextResponse.json({ error: "invalid_type", message: "Choose running, duathlon, or triathlon." }, { status: 400 });
  }
  if (!eventName || !eventName.trim()) {
    return NextResponse.json({ error: "missing_name", message: "Enter a name for the event." }, { status: 400 });
  }
  if (!targetDistance || !DISTANCE_OPTIONS[eventType].includes(targetDistance)) {
    return NextResponse.json({ error: "invalid_distance", message: "Choose a distance from the list." }, { status: 400 });
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

  try {
    await saveRaceGoal(session.userId, {
      eventType,
      eventName: eventName.trim(),
      eventDate,
      targetDistance,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to save race goal:", e);
    return NextResponse.json({ error: "server_error", message: String(e.message || e) }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    await deleteRaceGoal(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to delete race goal:", e);
    return NextResponse.json({ error: "server_error", message: String(e.message || e) }, { status: 500 });
  }
}
