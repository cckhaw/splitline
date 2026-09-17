import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesForUser, getUserById, getAiInsights, saveAiInsights } from "@/lib/db";
import { computeTrainingLoad, predictRacePaces, buildActivitySummary } from "@/lib/insights";
import { generateHealthAnalysis } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

function hashSummary(summary) {
  return crypto.createHash("sha256").update(JSON.stringify(summary)).digest("hex");
}

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const [activities, user] = await Promise.all([
    getActivitiesForUser(session.userId, 30),
    getUserById(session.userId),
  ]);

  const summary = buildActivitySummary(activities, { birthDate: user?.birth_date });
  const response = {
    load: computeTrainingLoad(activities),
    pace: predictRacePaces(activities),
    sampleSize: activities.length,
    ageYears: summary.ageYears,
    ageSource: summary.ageSource,
  };

  if (!activities.length) {
    return NextResponse.json({ ...response, ai: null });
  }

  const inputHash = hashSummary(summary);
  let cached = null;
  try {
    cached = await getAiInsights(session.userId);
  } catch (e) {
    console.error("Failed to read cached AI insights:", e);
  }

  if (!forceRefresh && cached && cached.input_hash === inputHash) {
    return NextResponse.json({ ...response, ai: cached.payload, aiGeneratedAt: cached.generated_at, aiCached: true });
  }

  try {
    const analysis = await generateHealthAnalysis(summary);
    await saveAiInsights(session.userId, inputHash, analysis);
    return NextResponse.json({ ...response, ai: analysis, aiGeneratedAt: new Date().toISOString(), aiCached: false });
  } catch (e) {
    console.error("AI health analysis failed:", e);
    // Fall back to a stale cached result rather than failing the whole panel.
    if (cached) {
      return NextResponse.json({ ...response, ai: cached.payload, aiGeneratedAt: cached.generated_at, aiCached: true, aiStale: true });
    }
    return NextResponse.json({ ...response, ai: null, aiError: String(e.message || e) });
  }
}
