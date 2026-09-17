import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authGuard";
import { getUserById, setStripeCustomerId } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { planPrice } from "@/lib/pricing";

export const runtime = "nodejs";

// Starts a Stripe Checkout session for a new subscription, an upgrade
// (Plus -> Pro), or a manual renewal of a lapsed one. Prices are sent
// inline (price_data) rather than referencing pre-created Stripe Price
// objects, so lib/pricing.js is the only place that needs editing to
// change what athletes pay — see that file's comment.
export async function POST(request) {
  const session = await getSessionUser(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { tier, interval } = await request.json().catch(() => ({}));
  const price = planPrice(tier, interval);
  if (!price) {
    return NextResponse.json({ error: "invalid_plan", message: "Choose a valid plan and billing interval." }, { status: 400 });
  }

  let client;
  try {
    client = stripe();
  } catch (e) {
    return NextResponse.json({ error: "billing_not_configured", message: String(e.message || e) }, { status: 500 });
  }

  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await client.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      await setStripeCustomerId(user.id, customerId);
    }

    const url = new URL(request.url);
    const checkoutSession = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: String(user.id),
      metadata: { userId: String(user.id), tier: price.tier, interval: price.interval },
      subscription_data: { metadata: { userId: String(user.id), tier: price.tier } },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Splitline ${price.label} (${price.interval === "year" ? "annual" : "monthly"})` },
            unit_amount: price.amountCents,
            recurring: { interval: price.interval },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${url.origin}/account?checkout=success`,
      cancel_url: `${url.origin}/account?checkout=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error("Stripe checkout session creation failed:", e);
    return NextResponse.json({ error: "checkout_failed", message: String(e.message || e) }, { status: 500 });
  }
}
