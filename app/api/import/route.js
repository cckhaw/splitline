import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getStravaConnection, updateStravaTokens, upsertActivity, countActivitiesForUser, upsertGear } from "@/lib/db";
import { getValidAccessToken, listActivities, getActivity, getStreams, getGear } from "@/lib/strava";

export const runtime = "nodejs";
export const maxDuration = 60; // Pro plan+; Hobby caps this lower regardless — see README.

const PAGE_SIZE = 5;   // small on purpose: 2 Strava calls per activity, done sequentially
const MAX_ACTIVITIES = 30;

function trim(arr) {
  if (!arr || !arr.length) return null;
  const step = Math.max(1, Math.floor(arr.length / 150));
  return arr.filter((_, i) => i % step === 0);
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

    const remaining = MAX_ACTIVITIES - (page - 1) * PAGE_SIZE;
    if (remaining <= 0) {
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

      // Gear (shoes/bikes) feeds the Equipment Lifecycle panel — fetched
      // once per unique piece of gear per import run and cached in the
      // `gear` table, non-fatal on failure (e.g. no gear tagged, or a
      // "bring your own Strava app" connection missing the gear scope).
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
          });
        } catch (e) {
          console.error(`Failed to fetch/cache gear ${detail.gear_id}:`, e);
        }
      }
    }

    const total = await countActivitiesForUser(session.userId);
    const done = summaries.length < PAGE_SIZE || total >= MAX_ACTIVITIES;
    return NextResponse.json({ imported, total, done, nextPage: page + 1 });
  } catch (e) {
    return NextResponse.json({ error: "strava_error", message: String(e.message || e) }, { status: 502 });
  }
}
