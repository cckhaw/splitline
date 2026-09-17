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
    // Retired gear (marked as such by the athlete on Strava) isn't
    // something they're still using, so it doesn't belong in a "what
    // needs replacing" list.
    const items = evaluateAllGear(gear.filter((g) => !g.retired), user?.weight_kg).map((item) => ({
      ...item,
      shopUrl: item.status === "healthy" ? null : shopSearchUrl(item),
    }));
    return NextResponse.json({ items, weightOnFile: Boolean(user?.weight_kg) });
  } catch (e) {
    console.error("Failed to load equipment:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
