import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import {
  getStravaConnection, updateStravaTokens, upsertActivity, getActivitiesForUser, countActivitiesForUser, upsertGear, setStravaAvatar,
  getOuraConnection, updateOuraTokens, upsertOuraDailyMetric,
} from "@/lib/db";
import { getValidAccessToken, listActivities, getActivity, getStreams, getGear, getAthlete } from "@/lib/strava";
import { getValidAccessToken as getValidOuraAccessToken, fetchDailyMetrics } from "@/lib/oura";
import { trackEvent } from "@/lib/usageEvents";

export const runtime = "nodejs";
export const maxDuration = 60; // Pro plan+; Hobby caps this lower regardless — see README.

const PAGE_SIZE = 5;   // small on purpose: 2 Strava calls per activity, done sequentially
const MAX_ACTIVITIES = 30;

function trim(arr) {
  if (!arr || !arr.length) return null;
  const step = Math.max(1, Math.floor(arr.length / 150));
  return arr.filter((_, i) => i % step === 0);
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Fetches and caches Oura sleep/recovery data for the same period the
// Activity Summary and Overtraining Shield panels already show — from
// the day of the earliest of the athlete's last 30 Strava activities
// through today — every time this completes, same as the Strava sync it
// rides alongside. Best-effort: no Oura connection, or any failure here,
// never blocks or fails the Strava import itself.
async function syncOuraData(request, userId) {
  const connection = await getOuraConnection(userId);
  if (!connection) return;

  try {
    const activities = await getActivitiesForUser(userId, MAX_ACTIVITIES);
    if (!activities.length) return;
    const earliest = activities.reduce((min, a) => (new Date(a.startDate) < new Date(min.startDate) ? a : min));
    const startDate = isoDate(earliest.startDate);
    const endDate = isoDate(new Date());

    const { accessToken, refreshed } = await getValidOuraAccessToken(connection);
    if (refreshed) await updateOuraTokens(userId, refreshed);

    const days = await fetchDailyMetrics(accessToken, startDate, endDate);
    for (const day of days) {
      await upsertOuraDailyMetric(userId, day);
    }
    trackEvent(request, userId, "oura_sync", { days: days.length });
  } catch (e) {
    console.error("Oura sync failed (continuing without it):", e);
  }
}

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { page = 1 } = await request.json().catch(() => ({}));

  const connection = await getStravaConnection(session.userId);
  if (!connection) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  try {
    const { accessToken, refreshed } = await getValidAccessToken(connection);
    if (refreshed) await updateStravaTokens(session.userId, refreshed);

    // The athlete's *complete* gear roster — every shoe/bike they've ever
    // registered on Strava, not just whatever's tagged on the 30 activities
    // being imported. Only /athlete (for the token's own owner) returns
    // this; deriving gear purely from imported activities' gear_id would
    // silently miss anything not worn in the last 30 activities. Runs once
    // per import/re-sync (page 1 only), before the early-return below, so
    // it still refreshes even when all 30 activities are already imported.
    if (page === 1) {
      // "resync" vs "initial import" is inferred from whether the user
      // already had any activities before this run touches anything —
      // simpler and more reliable than trusting a client-supplied flag.
      const hadActivitiesBefore = (await countActivitiesForUser(session.userId)) > 0;
      trackEvent(request, session.userId, "strava_sync", { trigger: hadActivitiesBefore ? "resync" : "initial" });

      try {
        const athlete = await getAthlete(accessToken);
        // athlete.profile is Strava's full-size profile photo URL (a plain
        // hotlinkable CDN URL, no auth needed to display it) — refreshed on
        // every sync unless the athlete has since uploaded their own crop.
        if (athlete.profile && !/avatar\/athlete/.test(athlete.profile)) {
          await setStravaAvatar(session.userId, athlete.profile);
        }
        const gearIds = [...(athlete.shoes || []), ...(athlete.bikes || [])].map((g) => g.id);
        for (const gearId of gearIds) {
          try {
            const gear = await getGear(accessToken, gearId);
            await upsertGear(session.userId, {
              id: gear.id,
              gearType: String(gear.id).startsWith("b") ? "bike" : "shoe",
              name: gear.name,
              brandName: gear.brand_name || null,
              modelName: gear.model_name || null,
              distanceKm: gear.distance != null ? gear.distance / 1000 : null,
              retired: Boolean(gear.retired),
            });
          } catch (e) {
            console.error(`Failed to fetch/cache gear ${gearId}:`, e);
          }
        }
      } catch (e) {
        console.error("Failed to fetch athlete gear roster:", e);
      }
    }

    const remaining = MAX_ACTIVITIES - (page - 1) * PAGE_SIZE;
    if (remaining <= 0) {
      await syncOuraData(request, session.userId);
      return NextResponse.json({ imported: 0, total: await countActivitiesForUser(session.userId), done: true });
    }

    const summaries = await listActivities(accessToken, PAGE_SIZE, page);
    let imported = 0;
    const gearFetchedThisRun = new Set(); // dedupe: several activities often share one shoe/bike

    for (const s of summaries.slice(0, remaining)) {
      const [detail, streams] = await Promise.all([
        getActivity(accessToken, s.id),
        getStreams(accessToken, s.id).catch(() => ({})),
      ]);
      await upsertActivity(session.userId, {
        stravaActivityId: detail.id,
        name: detail.name,
        sport: detail.sport_type || detail.type,
        startDate: detail.start_date_local,
        distanceKm: detail.distance / 1000,
        movingMin: detail.moving_time / 60,
        elevationGainM: detail.total_elevation_gain,
        avgHr: detail.average_heartrate || null,
        avgWatts: detail.average_watts || null,
        avgSpeedKmh: detail.average_speed * 3.6,
        calories: detail.calories || null,
        avgTempC: detail.average_temp ?? null,
        trace: {
          elevation: trim(streams.altitude?.data),
          heart_rate: trim(streams.heartrate?.data),
          power: trim(streams.watts?.data),
          // Pace/cadence streams aren't rendered on the overlay card (yet),
          // but feed lib/biomechanics.js's aerobic-decoupling and
          // cadence-drift calculations for the Biomechanical Shield —
          // trimmed the same way so all four arrays stay index-aligned.
          pace: trim(streams.velocity_smooth?.data),
          cadence: trim(streams.cadence?.data),
        },
        gearId: detail.gear_id || null,
      });
      imported++;

      // Supplementary to the athlete-roster fetch above: that call fetches
      // everything registered on the athlete's profile, but if it fails
      // (network hiccup, transient Strava error) this still catches
      // whatever gear these 30 activities actually reference, so a bad
      // roster fetch degrades to the old per-activity behavior instead of
      // silently leaving the gear table stale.
      if (detail.gear_id && !gearFetchedThisRun.has(detail.gear_id)) {
        gearFetchedThisRun.add(detail.gear_id);
        try {
          const gear = await getGear(accessToken, detail.gear_id);
          await upsertGear(session.userId, {
            id: gear.id,
            gearType: String(gear.id).startsWith("b") ? "bike" : "shoe",
            name: gear.name,
            brandName: gear.brand_name || null,
            modelName: gear.model_name || null,
            distanceKm: gear.distance != null ? gear.distance / 1000 : null,
            retired: Boolean(gear.retired),
          });
        } catch (e) {
          console.error(`Failed to fetch/cache gear ${detail.gear_id}:`, e);
        }
      }
    }

    const total = await countActivitiesForUser(session.userId);
    const done = summaries.length < PAGE_SIZE || total >= MAX_ACTIVITIES;
    if (done) await syncOuraData(request, session.userId);
    return NextResponse.json({ imported, total, done, nextPage: page + 1 });
  } catch (e) {
    return NextResponse.json({ error: "strava_error", message: String(e.message || e) }, { status: 502 });
  }
}
