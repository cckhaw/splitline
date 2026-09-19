import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/authGuard";
import {
  getActivitiesForUser, getUserById, getRaceGoal, getRaceCourse, getRaceDayPlan, saveRaceDayPlan,
  getAiUsage, recordAiUsage, friendlyDbErrorMessage,
} from "@/lib/db";
import { buildActivitySummary } from "@/lib/insights";
import { computeGradeAdjustment } from "@/lib/raceDay";
import { generateRaceDayPlan } from "@/lib/anthropic";
import { resolveEffectiveTier, isRefreshEligible, nextEligibleDate } from "@/lib/membership";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";
export const maxDuration = 60; // Pro plan+; Hobby caps this lower regardless — see README.

const FEATURE = "race_day";
const MIN_TEMP_C = -20;
const MAX_TEMP_C = 55;
const MAX_ELEVATION_M = 12000; // generous ultramountain ceiling

function weeksUntil(eventDate, now) {
  const ms = new Date(eventDate).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

function hashInput(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function eventInfoFor(goal, now) {
  return {
    eventType: goal.eventType,
    eventName: goal.eventName,
    eventDate: goal.eventDate,
    targetDistance: goal.targetDistance,
    goalTime: goal.goalTime,
    weeksUntilEvent: weeksUntil(goal.eventDate, now),
  };
}

// Read-only load for the page: the saved goal, whatever's cached (so a
// page reload shows the last plan and pre-fills the form with the inputs
// that produced it), and tier — never generates.
export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const goal = await getRaceGoal(session.userId);
    if (!goal) return NextResponse.json({ error: "no_goal", message: "Set an upcoming event on the Training plan page first." }, { status: 400 });
    const [user, cached] = await Promise.all([getUserById(session.userId), getRaceDayPlan(session.userId)]);
    const tier = resolveEffectiveTier(user);
    return NextResponse.json({
      goal: eventInfoFor(goal, new Date()),
      tier,
      plan: cached?.payload || null,
      raceDayInputs: cached?.race_day_inputs || null,
      generatedAt: cached?.generated_at || null,
    });
  } catch (e) {
    console.error("Failed to load race-day plan:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}

// Generates (or serves the cached, unchanged) plan from submitted
// race-day inputs — the same sameContent/eligible/locked anti-gaming
// pattern as /api/training-plan, extended with the race-day inputs as
// part of what "changed" means.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const temperatureC = Number(body.temperatureC);
  const humidityPct = body.humidityPct === "" || body.humidityPct == null ? null : Number(body.humidityPct);
  // Once a course is uploaded, its own computed elevation gain is
  // authoritative — see below, after the course is loaded — but a
  // number is still required here for the no-course path (and as a
  // sane fallback if course loading somehow fails).
  const manualElevationGainM = Number(body.courseElevationGainM);
  // Provenance only, for display and for the AI prompt's confidence
  // framing — never trusted for anything beyond that.
  const temperatureMinC = Number.isFinite(Number(body.temperatureMinC)) ? Number(body.temperatureMinC) : null;
  const temperatureMaxC = Number.isFinite(Number(body.temperatureMaxC)) ? Number(body.temperatureMaxC) : null;
  const temperatureSource = ["forecast", "historical_average", "manual"].includes(body.temperatureSource) ? body.temperatureSource : "manual";

  if (!Number.isFinite(temperatureC) || temperatureC < MIN_TEMP_C || temperatureC > MAX_TEMP_C) {
    return NextResponse.json({ error: "invalid_temperature", message: `Enter an expected temperature between ${MIN_TEMP_C} and ${MAX_TEMP_C}°C.` }, { status: 400 });
  }
  if (humidityPct != null && (!Number.isFinite(humidityPct) || humidityPct < 0 || humidityPct > 100)) {
    return NextResponse.json({ error: "invalid_humidity", message: "Humidity must be between 0 and 100%." }, { status: 400 });
  }

  let goal, activities, user, course, cached, usage;
  try {
    goal = await getRaceGoal(session.userId);
    if (!goal) return NextResponse.json({ error: "no_goal", message: "Set an upcoming event on the Training plan page first." }, { status: 400 });
    [activities, user, course, cached, usage] = await Promise.all([
      getActivitiesForUser(session.userId, 30),
      getUserById(session.userId),
      getRaceCourse(session.userId),
      getRaceDayPlan(session.userId),
      getAiUsage(session.userId, FEATURE),
    ]);
  } catch (e) {
    console.error("Failed to load data for race-day plan:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }

  // The uploaded course's own computed gain is real data; a manually
  // typed number is only trusted when there's no course to derive it from.
  const courseElevationGainM = course ? course.total_elevation_gain_m : manualElevationGainM;
  if (!Number.isFinite(courseElevationGainM) || courseElevationGainM < 0 || courseElevationGainM > MAX_ELEVATION_M) {
    return NextResponse.json({ error: "invalid_elevation", message: "Enter a valid course elevation gain in meters, or upload a GPX course." }, { status: 400 });
  }

  const tier = resolveEffectiveTier(user);
  const now = new Date();
  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date }, now);
  const eventInfo = eventInfoFor(goal, now);
  const gradeAdjustment = computeGradeAdjustment(activities);
  const raceDayInputs = { temperatureC, temperatureMinC, temperatureMaxC, humidityPct, courseElevationGainM, temperatureSource };
  const courseSegments = course?.segments || null;

  // The course's uploaded_at is bumped on every save (including
  // replacing it with a new file) — including it here means a new GPX
  // upload changes the hash even if every manually-entered input stays
  // exactly the same, so the plan regenerates against the new terrain.
  const inputHash = hashInput({ summary, eventInfo, raceDayInputs, gradeAdjustment, courseUploadedAt: course?.uploaded_at || null });
  const sameContent = Boolean(cached && cached.input_hash === inputHash);

  if (sameContent) {
    return NextResponse.json({ goal: eventInfo, tier, plan: cached.payload, raceDayInputs: cached.race_day_inputs, generatedAt: cached.generated_at, cached: true, locked: false });
  }

  const eligible = isRefreshEligible(tier, usage?.last_used_at);
  if (eligible) {
    trackEvent(request, session.userId, "race_day_plan_generate", { trigger: cached ? "regenerate" : "generate" });
    try {
      const plan = await generateRaceDayPlan(summary, eventInfo, raceDayInputs, gradeAdjustment, courseSegments);
      try {
        await saveRaceDayPlan(session.userId, inputHash, raceDayInputs, plan);
        await recordAiUsage(session.userId, FEATURE);
      } catch (e) {
        console.error("Failed to cache race-day plan (returning it anyway):", e);
      }
      return NextResponse.json({ goal: eventInfo, tier, plan, raceDayInputs, generatedAt: new Date().toISOString(), cached: false, locked: false });
    } catch (e) {
      console.error("AI race-day plan generation failed:", e);
      return NextResponse.json({ goal: eventInfo, tier, plan: null, raceDayInputs, error: String(e.message || e) });
    }
  }

  const nextEligibleAt = nextEligibleDate(tier, usage?.last_used_at);
  return NextResponse.json({
    goal: eventInfo, tier, plan: null, raceDayInputs, locked: true, nextEligibleAt,
    staleForDifferentInputs: Boolean(cached),
  });
}
