import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getActivitiesPageForUser } from "@/lib/db";

export const runtime = "nodejs";

// Separate from GET /api/activities (which the dashboard uses for "the
// last 30, unfiltered, all at once") — this backs the Activities page's
// own paginated, date-filterable gallery, where fetching every stored
// activity (now up to 100 — see app/api/import/route.js's housekeeping)
// just to show 6 at a time would be wasteful.
const PAGE_SIZE = 6; // fixed — the gallery renders a 3x2 grid per page

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1);
  const fromDate = url.searchParams.get("from") || null;
  const toDate = url.searchParams.get("to") || null;

  const { activities, total } = await getActivitiesPageForUser(session.userId, { page, pageSize: PAGE_SIZE, fromDate, toDate });
  return NextResponse.json({
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
      sport: a.sport,
      startDate: a.startDate,
      distanceKm: a.distanceKm,
      hasHr: Boolean(a.avgHr),
      hasWatts: Boolean(a.avgWatts),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
