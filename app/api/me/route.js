import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, getStravaConnection, countActivitiesForUser, friendlyDbErrorMessage } from "@/lib/db";
import { resolveEffectiveTier, isTrialTier } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ authenticated: false });

  try {
    const user = await getUserById(session.userId);
    // A session token stays valid (not expired) independently of the
    // account it points to — deleting the account (see
    // /api/account/delete) doesn't revoke tokens still floating around
    // elsewhere (another tab, another device). Every protected page's
    // auth check goes through this endpoint, so treating a missing user
    // as logged-out here is what actually kicks a stale session to /login.
    if (!user) return NextResponse.json({ authenticated: false });

    const connection = await getStravaConnection(session.userId);
    const activityCount = await countActivitiesForUser(session.userId);

    return NextResponse.json({
      authenticated: true,
      name: user?.name,
      email: user?.email,
      emailVerified: user?.email_verified,
      hasGoogleLogin: Boolean(user?.google_id),
      birthDate: user?.birth_date,
      weightKg: user?.weight_kg,
      avatarUrl: user?.avatar_url || null,
      avatarSource: user?.avatar_source || null,
      tier: resolveEffectiveTier(user),
      tierExpiresAt: user?.tier_expires_at,
      isTrial: isTrialTier(user),
      hasStripeCustomer: Boolean(user?.stripe_customer_id),
      stravaConnected: Boolean(connection),
      usingOwnStravaApp: Boolean(connection?.ownClientId),
      activityCount,
    });
  } catch (e) {
    console.error("Failed to load current user:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
