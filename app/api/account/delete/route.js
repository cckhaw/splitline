import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, getUserByEmail, deleteUser, friendlyDbErrorMessage } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { password, confirmEmail } = await request.json().catch(() => ({}));

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

    await deleteUser(session.userId);

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (e) {
    console.error("Account deletion failed:", e);
    return NextResponse.json({ error: "server_error", message: friendlyDbErrorMessage(e) }, { status: 500 });
  }
}
