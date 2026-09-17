// Splitline's paid-tier pricing. Edit the numbers here to change prices
// — the Checkout Session is built with Stripe's inline `price_data`
// (see app/api/billing/checkout/route.js), not pre-created Stripe Price
// objects, so nothing needs to be kept in sync on the Stripe dashboard
// side when these change. Amounts are in whole US cents.

export const PLANS = {
  plus: {
    tier: "plus",
    label: "Plus",
    tagline: "For athletes who want fresher AI guidance",
    monthly: { amountCents: 199, interval: "month" },
    yearly: { amountCents: 1999, interval: "year" },
  },
  pro: {
    tier: "pro",
    label: "Pro",
    tagline: "Unlimited AI refreshes, whenever you train",
    monthly: { amountCents: 299, interval: "month" },
    yearly: { amountCents: 2999, interval: "year" },
  },
};

export function planPrice(tier, interval) {
  const plan = PLANS[tier];
  if (!plan) return null;
  const price = interval === "year" ? plan.yearly : plan.monthly;
  return price ? { ...price, tier, label: plan.label } : null;
}

export function formatUsd(amountCents) {
  return `$${(amountCents / 100).toFixed(2)}`;
}
