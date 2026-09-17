import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, getUserById, getRaceGoal, getTrainingPlan, saveTrainingPlan, getAiUsage, recordAiUsage, friendlyDbErrorMessage } from "@/lib/db";
import { buildActivitySummary } from "@/lib/insights";
import { generateTrainingPlan } from "@/lib/anthropic";
import { resolveEffectiveTier, isRefreshEligible, nextEligibleDate } from "@/lib/membership";

export const runtime = "nodejs";
export const maxDuration = 60; // Pro plan+; Hobby caps this lower regardless — see README.

const FEATURE = "training_plan";

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

  let goal, activities, user, cached, usage;
  try {
    goal = await getRaceGoal(session.userId);
    if (!goal) return NextResponse.json({ error: "no_goal", message: "Set an upcoming event first." }, { status: 400 });
    [activities, user, cached, usage] = await Promise.all([
      getActivitiesForUser(session.userId, 30),
      getUserById(session.userId),
      getTrainingPlan(session.userId),
      getAiUsage(session.userId, FEATURE),
    ]);
  } catch (e) {
    console.error("Failed to load data for training plan:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }

  const tier = resolveEffectiveTier(user);
  const now = new Date();
  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date }, now);
  const eventInfo = {
    eventType: goal.eventType,
    eventName: goal.eventName,
    eventDate: goal.eventDate,
    targetDistance: goal.targetDistance,
    goalTime: goal.goalTime,
    weeksUntilEvent: weeksUntil(goal.eventDate, now),
  };

  const inputHash = hashInput({ summary, eventInfo });
  const sameContent = Boolean(cached && cached.input_hash === inputHash);

  // Cached content that still matches the current goal and activity data
  // is always safe to serve, whether or not this tier is eligible to
  // regenerate — nothing needs to change to show it. Ignore forceRefresh
  // here too: re-clicking "Refresh" when nothing's changed shouldn't
  // spend a refresh.
  if (sameContent && !forceRefresh) {
    return NextResponse.json({ goal: eventInfo, tier, plan: cached.payload, generatedAt: cached.generated_at, cached: true, locked: false });
  }

  const eligible = isRefreshEligible(tier, usage?.last_used_at);
  if (eligible) {
    try {
      const plan = await generateTrainingPlan(summary, eventInfo);
      try {
        await saveTrainingPlan(session.userId, inputHash, plan);
        await recordAiUsage(session.userId, FEATURE);
      } catch (e) {
        console.error("Failed to cache training plan (returning it anyway):", e);
      }
      return NextResponse.json({ goal: eventInfo, tier, plan, generatedAt: new Date().toISOString(), cached: false, locked: false });
    } catch (e) {
      console.error("AI training plan generation failed:", e);
      if (sameContent) {
        return NextResponse.json({ goal: eventInfo, tier, plan: cached.payload, generatedAt: cached.generated_at, cached: true, stale: true, locked: false });
      }
      return NextResponse.json({ goal: eventInfo, tier, plan: null, error: String(e.message || e) });
    }
  }

  // Not eligible to (re)generate. Cached content for THIS goal is still
  // fine to show (it's just aging, not wrong); cached content for a
  // DIFFERENT goal would be actively misleading (a plan for a different
  // race/distance), so that gets hidden behind the locked state instead
  // of shown as if it were current.
  const nextEligibleAt = nextEligibleDate(tier, usage?.last_used_at);
  if (cached && sameContent) {
    return NextResponse.json({ goal: eventInfo, tier, plan: cached.payload, generatedAt: cached.generated_at, cached: true, locked: true, nextEligibleAt });
  }
  return NextResponse.json({ goal: eventInfo, tier, plan: null, locked: true, nextEligibleAt, staleForDifferentGoal: Boolean(cached) });
}
