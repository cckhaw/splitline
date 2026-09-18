import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/authGuard";
import {
  getUserById, getUserByEmail, deleteUser, recordDeletedUser, adminUserEventCounts, countActivitiesForUser, friendlyDbErrorMessage,
} from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { resolveEffectiveTier, isTrialTier } from "@/lib/membership";

export const runtime = "nodejs";

const MAX_REASON_LENGTH = 2000;

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { password, confirmEmail, reason } = await request.json().catch(() => ({}));

  try {
    const user = await getUserById(session.userId);
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (String(confirmEmail || "").trim().toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "email_mismatch", message: "Type your account email exactly to confirm." }, { status: 400 });
    }

    // Same rule as changing your password: an account with no password
    // yet (Google-only sign-in) skips this check; one with a password
    // set must re-enter it, session hijack or shared-device protection.
    const withHash = await getUserByEmail(user.email);
    if (withHash.password_hash) {
      if (!password || !(await bcrypt.compare(password, withHash.password_hash))) {
        return NextResponse.json({ error: "wrong_password", message: "Current password is incorrect." }, { status: 401 });
      }
    }

    // Best-effort — a Stripe hiccup shouldn't block someone from deleting
    // their own account and data; an orphaned subscription can still be
    // cancelled manually from the Stripe dashboard.
    if (user.stripe_subscription_id) {
      try {
        const { stripe } = await import("@/lib/stripe");
        await stripe().subscriptions.cancel(user.stripe_subscription_id);
      } catch (e) {
        console.error("Failed to cancel Stripe subscription during account deletion (continuing):", e);
      }
    }

    // Snapshot just enough to let the site operator reach out about why
    // someone left — disclosed at delete time and in the Privacy Policy.
    // Taken right before the erase, from data that's about to be gone.
    try {
      const [eventCountRows, activityCount] = await Promise.all([
        adminUserEventCounts(session.userId),
        countActivitiesForUser(session.userId),
      ]);
      await recordDeletedUser({
        originalUserId: user.id,
        name: user.name,
        email: user.email,
        tier: resolveEffectiveTier(user),
        wasTrial: isTrialTier(user),
        signedUpAt: user.created_at,
        activityCount,
        eventCounts: Object.fromEntries(eventCountRows.map((r) => [r.event_type, r.n])),
        reason: reason ? String(reason).slice(0, MAX_REASON_LENGTH) : null,
      });
    } catch (e) {
      // Never let a snapshot failure block someone from actually deleting
      // their account — that's the one promise this endpoint can't break.
      console.error("Failed to record deleted-user snapshot (continuing with deletion):", e);
    }

    await deleteUser(session.userId);

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (e) {
    console.error("Account deletion failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
