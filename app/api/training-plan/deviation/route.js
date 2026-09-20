import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/authGuard";
import {
  getActivitiesForUser, getUserById, getRaceGoal, getTrainingPlan, saveTrainingPlan,
  getTrainingPlanDeviation, saveTrainingPlanDeviation, setTrainingPlanDeviationStatus,
  getSleepMetricsForActivities, getAiUsage, recordAiUsage, friendlyDbErrorMessage,
} from "@/lib/db";
import { buildActivitySummary } from "@/lib/insights";
import { buildWeeklyActuals } from "@/lib/trainingPlanDeviation";
import { generateTrainingPlan, generateTrainingPlanDeviation, generateAdjustedTrainingPlan } from "@/lib/anthropic";
import { resolveEffectiveTier, isRefreshEligible, nextEligibleDate } from "@/lib/membership";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";
export const maxDuration = 60; // Pro plan+; Hobby caps this lower regardless — see README.

// Deliberately shares the training-plan feature's own ai_usage bucket
// rather than getting a rate limit of its own — regenerating, adjusting,
// and this deviation check itself all draw from the same tier-based
// budget, the same way an auto-triggered plan regeneration already
// spends from it today (see /api/training-plan/route.js).
const FEATURE = "training_plan";

function weeksUntil(eventDate, now) {
  const ms = new Date(eventDate).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}
function hashInput(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function buildEventInfo(goal, now) {
  return {
    eventType: goal.eventType, eventName: goal.eventName, eventDate: goal.eventDate,
    targetDistance: goal.targetDistance, goalTime: goal.goalTime, weeksUntilEvent: weeksUntil(goal.eventDate, now),
  };
}

async function loadContext(session) {
  const goal = await getRaceGoal(session.userId);
  if (!goal) return { goal: null };
  const [activities, user, cachedPlan] = await Promise.all([
    getActivitiesForUser(session.userId, 30),
    getUserById(session.userId),
    getTrainingPlan(session.userId),
  ]);
  return { goal, activities, user, cachedPlan };
}

// A background check triggered by "Re-sync from Strava" (and on normal
// dashboard load, so a still-pending alert from an earlier resync isn't
// lost) — never a user-clicked "refresh", so ineligibility or a failure
// is a silent no-op rather than something shown as an error/lock state.
export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  let ctx;
  try {
    ctx = await loadContext(session);
  } catch (e) {
    console.error("Failed to load data for training plan deviation check:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
  if (!ctx.goal || !ctx.cachedPlan) return NextResponse.json({ active: false });

  const { goal, activities, user, cachedPlan } = ctx;
  const now = new Date();
  const planGeneratedAt = new Date(cachedPlan.generated_at);
  const weeksSincePlan = Math.floor((now - planGeneratedAt) / (7 * 24 * 60 * 60 * 1000));
  if (weeksSincePlan < 1) return NextResponse.json({ active: false, reason: "too_soon" });

  const activitiesSincePlan = activities.filter((a) => new Date(a.startDate) >= planGeneratedAt);
  if (!activitiesSincePlan.length) return NextResponse.json({ active: false, reason: "no_new_activity" });

  const weeklyActuals = buildWeeklyActuals(activitiesSincePlan, planGeneratedAt, now);
  const sleepMetrics = await getSleepMetricsForActivities(session.userId, activities);
  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date }, now, sleepMetrics);
  const inputHash = hashInput({ planInputHash: cachedPlan.input_hash, weeklyActuals, weeksSincePlan, sleepRecovery: summary.sleepRecovery });

  let existing = null;
  try {
    existing = await getTrainingPlanDeviation(session.userId);
  } catch (e) {
    console.error("Failed to read cached training plan deviation:", e);
  }
  if (existing && existing.input_hash === inputHash) {
    return NextResponse.json({ active: true, ...existing.payload, status: existing.status, generatedAt: existing.generated_at });
  }

  const tier = resolveEffectiveTier(user);
  let usage = null;
  try {
    usage = await getAiUsage(session.userId, FEATURE);
  } catch (e) {
    console.error("Failed to read training-plan AI usage:", e);
  }
  if (!isRefreshEligible(tier, usage?.last_used_at)) {
    return NextResponse.json({ active: false, reason: "rate_limited" });
  }

  const payload = {
    plan_phases: cachedPlan.payload.phases.map((p) => ({
      name: p.name, weeks: p.weeks, focus: p.focus,
      weekly_volume_guidance: p.weekly_volume_guidance, weekly_time_estimate: p.weekly_time_estimate, relative_load: p.relative_load,
    })),
    plan_generated_at: planGeneratedAt.toISOString().slice(0, 10),
    weeks_since_plan_started: weeksSincePlan,
    upcoming_event: buildEventInfo(goal, now),
    weekly_actuals_since_plan: weeklyActuals,
    recent_30day_weekly_distance_km: summary.weeklyDistanceKm,
    biomechanics: summary.biomechanics,
    training_load: summary.trainingLoad,
    sleep_recovery: summary.sleepRecovery,
  };

  try {
    const analysis = await generateTrainingPlanDeviation(payload);
    try {
      await saveTrainingPlanDeviation(session.userId, cachedPlan.input_hash, inputHash, analysis);
      await recordAiUsage(session.userId, FEATURE);
    } catch (e) {
      console.error("Failed to cache training plan deviation (returning it anyway):", e);
    }
    trackEvent(request, session.userId, "training_plan_deviation_check", { significant: analysis.significant_deviation });
    return NextResponse.json({ active: true, ...analysis, status: "pending", generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("AI training plan deviation analysis failed:", e);
    return NextResponse.json({ active: false, reason: "error" });
  }
}

// The athlete's explicit choice from the dashboard alert: regenerate the
// plan from scratch, adjust it around the deviation, or continue as-is
// (which just marks the deviation acknowledged for the Training Plan
// page to annotate — it doesn't touch the plan itself).
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { action } = await request.json().catch(() => ({}));
  if (!["regenerate", "adjust", "continue"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await loadContext(session);
  } catch (e) {
    console.error("Failed to load data for training plan deviation action:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
  if (!ctx.goal || !ctx.cachedPlan) return NextResponse.json({ error: "no_plan", message: "No training plan to act on." }, { status: 400 });
  const { goal, activities, user, cachedPlan } = ctx;

  if (action === "continue") {
    try {
      await setTrainingPlanDeviationStatus(session.userId, "acknowledged");
    } catch (e) {
      console.error("Failed to mark training plan deviation acknowledged:", e);
      return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
    }
    trackEvent(request, session.userId, "training_plan_deviation_continue");
    return NextResponse.json({ ok: true });
  }

  const now = new Date();
  const sleepMetrics = await getSleepMetricsForActivities(session.userId, activities);
  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date }, now, sleepMetrics);
  const eventInfo = buildEventInfo(goal, now);
  const tier = resolveEffectiveTier(user);

  let usage = null;
  try {
    usage = await getAiUsage(session.userId, FEATURE);
  } catch (e) {
    console.error("Failed to read training-plan AI usage:", e);
  }
  if (!isRefreshEligible(tier, usage?.last_used_at)) {
    return NextResponse.json(
      { error: "locked", message: "You've used this tier's plan refresh for now.", nextEligibleAt: nextEligibleDate(tier, usage?.last_used_at) },
      { status: 429 }
    );
  }

  try {
    let plan;
    if (action === "regenerate") {
      trackEvent(request, session.userId, "training_plan_deviation_regenerate");
      plan = await generateTrainingPlan(summary, eventInfo);
    } else {
      let deviationRecord = null;
      try {
        deviationRecord = await getTrainingPlanDeviation(session.userId);
      } catch (e) {
        console.error("Failed to read training plan deviation for adjustment:", e);
      }
      trackEvent(request, session.userId, "training_plan_deviation_adjust");
      plan = await generateAdjustedTrainingPlan(summary, eventInfo, cachedPlan.payload, deviationRecord?.payload || null);
    }
    // Same hash shape /api/training-plan computes for {summary, eventInfo} —
    // saving under it here means the next normal page load treats this as
    // the current, matching plan rather than regenerating again.
    const inputHash = hashInput({ summary, eventInfo });
    try {
      await saveTrainingPlan(session.userId, inputHash, plan);
      await recordAiUsage(session.userId, FEATURE);
    } catch (e) {
      console.error("Failed to cache regenerated/adjusted training plan (returning it anyway):", e);
    }
    return NextResponse.json({ ok: true, plan, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Training plan deviation action failed:", e);
    return NextResponse.json({ error: "server_error", message: String(e.message || e) }, { status: 500 });
  }
}
