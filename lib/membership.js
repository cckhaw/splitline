// Membership tiers gate how often the two AI features (injury/recovery
// analysis, training plan) are allowed to actually call Claude — that's
// the real cost driver in this app, so tier limits are enforced at the
// point of deciding whether to generate, not just displayed as a badge.
//
// tier_expires_at on the users row is the single source of truth for
// both a paid Stripe subscription's current period end AND a comped
// promotional period (see BETA_PRO_TRIAL_DAYS below) — there's no
// separate "trial" flag. Expiry is resolved live on every read via
// resolveEffectiveTier() rather than written back by a cron job: a
// lapsed tier_expires_at simply stops counting as that tier the next
// time anything checks, no background process required.

export const TIERS = {
  free: { key: "free", label: "Free", refreshIntervalDays: 90 },
  plus: { key: "plus", label: "Plus", refreshIntervalDays: 30 },
  pro: { key: "pro", label: "Pro", refreshIntervalDays: 0 }, // 0 = unlimited
};

export const DEFAULT_TIER = "free";

// New accounts are comped Pro for this many days as a beta-launch
// incentive. Configurable via NEXT_PUBLIC_BETA_PRO_TRIAL_DAYS (the
// NEXT_PUBLIC_ prefix is required, not optional — app/page.js's beta
// banner reads this same constant client-side, and Next.js only
// exposes env vars to the browser bundle under that prefix, inlined at
// build time). Set to 0 to turn the promo off once beta ends — existing
// beta users keep whatever tier_expires_at they were already granted;
// this only affects new signups going forward. On Vercel, changing the
// value needs a redeploy either way, so the build-time-inlining caveat
// doesn't add any extra step in practice.
const parsedBetaTrialDays = Number(process.env.NEXT_PUBLIC_BETA_PRO_TRIAL_DAYS);
export const BETA_PRO_TRIAL_DAYS = Number.isFinite(parsedBetaTrialDays) && parsedBetaTrialDays >= 0 ? parsedBetaTrialDays : 90;

export function tierConfig(tier) {
  return TIERS[tier] || TIERS[DEFAULT_TIER];
}

// Options to spread into lib/db.js's createUser() — grants the beta
// promo when active, or plain free-tier defaults (a no-op) when not.
// Centralized here so both signup paths (password and Google) apply the
// exact same rule.
export function betaSignupTierGrant(now = new Date()) {
  if (!BETA_PRO_TRIAL_DAYS || BETA_PRO_TRIAL_DAYS <= 0) return {};
  return {
    tier: "pro",
    tierExpiresAt: new Date(now.getTime() + BETA_PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };
}

// A user row's stored `tier` reflects the last tier they were granted,
// which may have since lapsed (subscription period ended, promo expired)
// without anything having written "free" back to the row yet. This is
// the one place that distinction gets resolved — call it instead of
// reading user.tier directly anywhere usage or access is gated.
export function resolveEffectiveTier(user) {
  const tier = user?.tier || DEFAULT_TIER;
  if (tier === "free") return "free";
  const expiresAt = user?.tierExpiresAt || user?.tier_expires_at;
  if (expiresAt && new Date(expiresAt) < new Date()) return "free";
  return tier;
}

// A comped tier (the beta promo, or any future free grant) vs. a paid
// subscription both just set tier + tier_expires_at — there's no separate
// "trial" flag. But a paid tier can only exist after a completed Stripe
// Checkout, which always sets stripe_customer_id (see the webhook's
// checkout.session.completed handler) and never gets cleared afterward —
// so a non-free tier with no Stripe customer on file must be a comped grant.
export function isTrialTier(user) {
  const tier = resolveEffectiveTier(user);
  return tier !== "free" && !(user?.stripeCustomerId || user?.stripe_customer_id);
}

// Whether a fresh AI generation is allowed right now, given the last
// time this feature actually generated (recorded in the ai_usage table,
// independent of whatever's currently cached — see lib/db.js). No prior
// use always means eligible (first generation is never rate-limited).
export function isRefreshEligible(tier, lastUsedAt, now = new Date()) {
  const days = tierConfig(tier).refreshIntervalDays;
  if (days <= 0) return true; // pro: unlimited
  if (!lastUsedAt) return true;
  return nextEligibleDate(tier, lastUsedAt).getTime() <= now.getTime();
}

export function nextEligibleDate(tier, lastUsedAt) {
  const days = tierConfig(tier).refreshIntervalDays;
  const base = lastUsedAt ? new Date(lastUsedAt) : new Date();
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}
