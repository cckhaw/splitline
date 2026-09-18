import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getGearForUser, getUserById, friendlyDbErrorMessage } from "@/lib/db";
import { evaluateAllGear, shopSearchUrl } from "@/lib/equipment";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  try {
    const [gear, user] = await Promise.all([getGearForUser(session.userId), getUserById(session.userId)]);
    // Every piece of gear Strava returned for this athlete, shoes and
    // bikes alike — retired items are included (flagged via item.status
    // === "retired") since they're still part of "all gear retrieved",
    // just not something to suggest shopping for a replacement.
    const items = evaluateAllGear(gear, user?.weight_kg).map((item) => ({
      ...item,
      shopUrl: item.status === "healthy" || item.status === "retired" ? null : shopSearchUrl(item),
    }));
    return NextResponse.json({ items, weightOnFile: Boolean(user?.weight_kg) });
  } catch (e) {
    console.error("Failed to load equipment:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
