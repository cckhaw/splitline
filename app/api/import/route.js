import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getStravaConnection, updateStravaTokens, upsertActivity, countActivitiesForUser } from "@/lib/db";
import { getValidAccessToken, listActivities, getActivity, getStreams } from "@/lib/strava";

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
        },
      });
      imported++;
    }

    const total = await countActivitiesForUser(session.userId);
    const done = summaries.length < PAGE_SIZE || total >= MAX_ACTIVITIES;
    return NextResponse.json({ imported, total, done, nextPage: page + 1 });
  } catch (e) {
    return NextResponse.json({ error: "strava_error", message: String(e.message || e) }, { status: 502 });
  }
}
