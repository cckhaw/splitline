import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { deleteOuraConnection, friendlyDbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

// Removes the Oura connection and every cached daily metric with it
// (lib/db.js's deleteOuraConnection deletes both) — Strava has no
// equivalent route today, but Oura is a second, separately-granted
// personal-health connection, so giving the athlete an explicit way to
// revoke it independently of disconnecting Strava is worth the extra
// route.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    await deleteOuraConnection(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to disconnect Oura:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
