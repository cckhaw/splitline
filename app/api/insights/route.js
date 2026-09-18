import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, getUserById, getAiInsights, saveAiInsights, getAiUsage, recordAiUsage, friendlyDbErrorMessage } from "@/lib/db";
import { computeTrainingLoad, predictRacePaces, buildActivitySummary } from "@/lib/insights";
import { generateHealthAnalysis } from "@/lib/anthropic";
import { resolveEffectiveTier, isRefreshEligible, nextEligibleDate } from "@/lib/membership";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";
export const maxDuration = 60;

const FEATURE = "injury";

function hashSummary(summary) {
  return crypto.createHash("sha256").update(JSON.stringify(summary)).digest("hex");
}

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  // Logged on the explicit "Refresh AI analysis" click itself, not on the
  // silent auto-load — this counts user-initiated refresh requests, tier
  // lock or generation failure notwithstanding.
  if (forceRefresh) trackEvent(request, session.userId, "ai_refresh_biomechanical");

  let activities, user;
  try {
    [activities, user] = await Promise.all([
      getActivitiesForUser(session.userId, 30),
      getUserById(session.userId),
    ]);
  } catch (e) {
    console.error("Failed to load data for insights:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }

  const tier = resolveEffectiveTier(user);
  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date });
  const response = {
    load: computeTrainingLoad(activities),
    pace: predictRacePaces(activities),
    sampleSize: activities.length,
    ageYears: summary.ageYears,
    ageSource: summary.ageSource,
    biomechanics: summary.biomechanics,
    tier,
  };

  if (!activities.length) {
    return NextResponse.json({ ...response, ai: null });
  }

  const inputHash = hashSummary(summary);
  let cached = null;
  let usage = null;
  try {
    [cached, usage] = await Promise.all([getAiInsights(session.userId), getAiUsage(session.userId, FEATURE)]);
  } catch (e) {
    console.error("Failed to read cached AI insights / usage:", e);
  }

  const wantsGenerate = !cached || forceRefresh || cached.input_hash !== inputHash;
  const eligible = isRefreshEligible(tier, usage?.last_used_at);

  if (wantsGenerate && eligible) {
    try {
      const analysis = await generateHealthAnalysis(summary);
      await saveAiInsights(session.userId, inputHash, analysis);
      await recordAiUsage(session.userId, FEATURE);
      return NextResponse.json({ ...response, ai: analysis, aiGeneratedAt: new Date().toISOString(), aiCached: false, aiLocked: false });
    } catch (e) {
      console.error("AI health analysis failed:", e);
      // Fall back to a stale cached result rather than failing the whole panel.
      if (cached) {
        return NextResponse.json({ ...response, ai: cached.payload, aiGeneratedAt: cached.generated_at, aiCached: true, aiStale: true, aiLocked: false });
      }
      return NextResponse.json({ ...response, ai: null, aiError: String(e.message || e) });
    }
  }

  if (wantsGenerate && !eligible) {
    const nextEligibleAt = nextEligibleDate(tier, usage?.last_used_at);
    if (cached) {
      return NextResponse.json({ ...response, ai: cached.payload, aiGeneratedAt: cached.generated_at, aiCached: true, aiLocked: true, nextEligibleAt });
    }
    return NextResponse.json({ ...response, ai: null, aiLocked: true, nextEligibleAt });
  }

  return NextResponse.json({ ...response, ai: cached.payload, aiGeneratedAt: cached.generated_at, aiCached: true, aiLocked: false });
}
