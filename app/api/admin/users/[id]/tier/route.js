import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminGuard";
import { adminGetUser, adminSetUserTier, friendlyDbErrorMessage } from "@/lib/db";
import { TIERS } from "@/lib/membership";

export const runtime = "nodejs";

// Sets tier/tier_expires_at directly — an operator override, same shape
// as the beta-signup comp grant (lib/membership.js's betaSignupTierGrant),
// entirely separate from Stripe. It doesn't touch stripe_subscription_id,
// so an existing paid subscription (if any) keeps billing on its own
// schedule regardless of what this sets tier to.
export async function POST(request, { params }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const userId = Number((await params).id);
  if (!Number.isInteger(userId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { tier, tierExpiresAt } = await request.json().catch(() => ({}));
  if (!Object.prototype.hasOwnProperty.call(TIERS, tier)) {
    return NextResponse.json({ error: "invalid_tier", message: `Tier must be one of: ${Object.keys(TIERS).join(", ")}.` }, { status: 400 });
  }
  let expiresAt = null;
  if (tierExpiresAt) {
    expiresAt = new Date(tierExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "invalid_expiry", message: "That expiry date isn't valid." }, { status: 400 });
    }
  }

  try {
    const user = await adminGetUser(userId);
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await adminSetUserTier(userId, tier, expiresAt);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin tier override failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
