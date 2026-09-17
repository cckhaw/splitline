import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

// Opens Stripe's hosted Customer Portal — update payment method, view
// invoices, or cancel. Plan changes/upgrades go through /api/billing/checkout
// instead (the portal's self-serve plan switcher needs pre-created Stripe
// Price objects in a product catalog, which conflicts with pricing
// entirely inline via price_data — see lib/pricing.js's comment).
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const user = await getUserById(session.userId);
  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: "no_subscription", message: "No billing account yet — subscribe to a plan first." }, { status: 400 });
  }

  let client;
  try {
    client = stripe();
  } catch (e) {
    return NextResponse.json({ error: "billing_not_configured", message: String(e.message || e) }, { status: 500 });
  }

  try {
    const url = new URL(request.url);
    const portalSession = await client.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${url.origin}/account`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (e) {
    console.error("Stripe billing portal session creation failed:", e);
    return NextResponse.json({ error: "portal_failed", message: String(e.message || e) }, { status: 500 });
  }
}
