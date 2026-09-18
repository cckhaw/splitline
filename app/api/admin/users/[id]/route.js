import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";
import { adminGetUser, adminUserEventCounts, adminUserRecentEvents, friendlyDbErrorMessage } from "@/lib/db";
import { resolveEffectiveTier, isTrialTier } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const userId = Number((await params).id);
  if (!Number.isInteger(userId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  try {
    const user = await adminGetUser(userId);
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const [eventCounts, recentEvents] = await Promise.all([
      adminUserEventCounts(userId),
      adminUserRecentEvents(userId, 50),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tier: resolveEffectiveTier(user),
        isTrial: isTrialTier(user),
        activityCount: user.activity_count,
        createdAt: user.created_at,
        rawTier: user.tier,
        tierExpiresAt: user.tier_expires_at,
        hasStripeCustomer: Boolean(user.stripe_customer_id),
      },
      eventCounts: Object.fromEntries(eventCounts.map((r) => [r.event_type, r.n])),
      recentEvents,
    });
  } catch (e) {
    console.error("Admin user detail query failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
