import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { deleteStravaConnection, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

// Removes only the stored Strava tokens (and any "bring your own app"
// credentials) — already-imported activities stay put, so reconnecting
// later (e.g. after Strava revokes the token) doesn't mean re-importing
// everything. Also the way out of a "token refresh failed" state.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    await deleteStravaConnection(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to disconnect Strava:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
