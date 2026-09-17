import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, getUserById, getRaceGoal, getTrainingPlan, saveTrainingPlan } from "@/lib/db";
import { buildActivitySummary } from "@/lib/insights";
import { generateTrainingPlan } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

function weeksUntil(eventDate, now) {
  const ms = new Date(eventDate).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

function hashInput(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const goal = await getRaceGoal(session.userId);
  if (!goal) return NextResponse.json({ error: "no_goal", message: "Set an upcoming event first." }, { status: 400 });

  const now = new Date();
  const [activities, user] = await Promise.all([
    getActivitiesForUser(session.userId, 30),
    getUserById(session.userId),
  ]);

  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date }, now);
  const eventInfo = {
    eventType: goal.eventType,
    eventName: goal.eventName,
    eventDate: goal.eventDate,
    targetDistance: goal.targetDistance,
    weeksUntilEvent: weeksUntil(goal.eventDate, now),
  };

  const inputHash = hashInput({ summary, eventInfo });
  let cached = null;
  try {
    cached = await getTrainingPlan(session.userId);
  } catch (e) {
    console.error("Failed to read cached training plan:", e);
  }

  if (!forceRefresh && cached && cached.input_hash === inputHash) {
    return NextResponse.json({ goal: eventInfo, plan: cached.payload, generatedAt: cached.generated_at, cached: true });
  }

  try {
    const plan = await generateTrainingPlan(summary, eventInfo);
    await saveTrainingPlan(session.userId, inputHash, plan);
    return NextResponse.json({ goal: eventInfo, plan, generatedAt: new Date().toISOString(), cached: false });
  } catch (e) {
    console.error("AI training plan generation failed:", e);
    if (cached) {
      return NextResponse.json({ goal: eventInfo, plan: cached.payload, generatedAt: cached.generated_at, cached: true, stale: true });
    }
    return NextResponse.json({ goal: eventInfo, plan: null, error: String(e.message || e) });
  }
}
