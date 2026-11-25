import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { updateStripeSubscription, getUserByStripeCustomerId, updateUserTier, query } from "@/lib/db";

export const runtime = "nodejs";

// Current Stripe API versions moved current_period_end off the
// Subscription object itself and onto each subscription item (for
// multi-item subscriptions with independently-timed billing cycles).
// Every subscription this app creates has exactly one item, so read it
// from there — subscription.current_period_end no longer exists.
function subscriptionPeriodEnd(subscription) {
  const item = subscription.items?.data?.[0];
  const seconds = item?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

// Webhooks need the exact raw request body for signature verification —
// request.text() gives that (App Router route handlers never auto-parse
// the body the way pages/api used to), unlike request.json() which would
// re-serialize it and break the signature check.
export async function POST(request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set — rejecting webhook.");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  const body = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    console.error("Stripe webhook signature verification failed:", e.message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Already handled this exact event (Stripe retries / duplicate delivery)?
  // A missing table (schema.sql not re-run) just disables dedupe.
  try {
    const seen = await query(`SELECT 1 FROM processed_stripe_events WHERE event_id = $1`, [event.id]);
    if (seen.length) return NextResponse.json({ received: true, duplicate: true });
  } catch (e) {
    if (e?.code !== "42P01") console.error("Stripe event dedupe lookup failed:", e);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;
        const userId = Number(session.client_reference_id || session.metadata?.userId);
        const tier = session.metadata?.tier;
        if (!userId || !tier || !session.subscription) break;

        const subscription = await stripe().subscriptions.retrieve(session.subscription);
        const tierExpiresAt = subscriptionPeriodEnd(subscription);
        if (!tierExpiresAt) break;
        await updateStripeSubscription(userId, {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          tier,
          tierExpiresAt,
        });
        break;
      }

      // Automatic recurring renewal (no new Checkout session involved) —
      // extend the existing tier's expiry to the new period end.
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        // Current API versions moved this off invoice.subscription (now
        // gone) and onto invoice.parent.subscription_details.subscription.
        const subscriptionDetails = invoice.parent?.subscription_details;
        const subscriptionRef = subscriptionDetails?.subscription;
        const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
        if (!subscriptionId || !invoice.customer) break;
        const user = await getUserByStripeCustomerId(invoice.customer);
        if (!user) break;
        // Ignore the invoice this event fires for on initial checkout —
        // checkout.session.completed above already set the period end
        // for that one, from the same subscription object.
        if (invoice.billing_reason === "subscription_create") break;

        const subscription = await stripe().subscriptions.retrieve(subscriptionId);
        const tierExpiresAt = subscriptionPeriodEnd(subscription);
        if (!tierExpiresAt) break;
        await updateUserTier(user.id, { tier: user.tier, tierExpiresAt });
        break;
      }

      // Subscription actually ended (canceled at period end, or
      // immediately). Don't force an immediate downgrade — tier_expires_at
      // already reflects the paid-through date, and resolveEffectiveTier
      // (lib/membership.js) naturally treats the tier as lapsed once that
      // date passes. Just detach the now-dead subscription id so a later
      // "Renew" click starts a fresh one instead of assuming this is live.
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const user = await getUserByStripeCustomerId(subscription.customer);
        if (!user) break;
        await query(`UPDATE users SET stripe_subscription_id = NULL WHERE id = $1`, [user.id]);
        break;
      }

      // Failed renewal: Stripe retries the charge itself and (per your
      // dunning settings) eventually cancels, which arrives as
      // customer.subscription.deleted. Nothing to change here — the paid
      // tier keeps running until tier_expires_at — but log it so it's visible.
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.warn(`Stripe invoice.payment_failed for customer ${invoice.customer} (attempt ${invoice.attempt_count ?? "?"}).`);
        break;
      }

      // Refund: log for manual review. Whether a refund should also end
      // access is a business decision, so access is not revoked automatically.
      case "charge.refunded": {
        const charge = event.data.object;
        console.warn(`Stripe charge.refunded for customer ${charge.customer} (charge ${charge.id}) — review whether to revoke access.`);
        break;
      }

      default:
        break; // Other event types aren't relevant to membership state.
    }
  } catch (e) {
    console.error(`Failed to handle Stripe webhook event ${event.type}:`, e);
    // Non-2xx so Stripe retries — a paid upgrade that hit a transient
    // database/Stripe error must not be silently dropped. (Handlers are
    // idempotent: they set absolute tier/expiry values.)
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  try {
    await query(`INSERT INTO processed_stripe_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING`, [event.id]);
  } catch (e) {
    if (e?.code !== "42P01") console.error("Failed to record processed Stripe event:", e);
  }

  return NextResponse.json({ received: true });
}
