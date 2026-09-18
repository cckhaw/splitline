# Splitline — a Strava analytics web app

Splitline is a multi-tenant Next.js app: anyone signs up, connects Strava
(the platform's shared app or their own), imports their last 30
activities, and gets a dashboard of AI-assisted training analysis built
from that data — an overtraining/injury-risk read, a periodized training
plan that tracks itself against actual training, a race-day pacing and
fueling plan, equipment wear tracking, and shareable exports of all of
it. Membership tiers gate how often the AI panels refresh; Stripe
handles billing. A separate, env-var-gated admin module gives the site
operator usage analytics and manual account controls. It's also still a
hosted MCP connector at `/api/mcp` for anyone who just wants the overlay
renderer as a tool in their own agent.

Most of what's below was actually run, not just written — signup through
Google/password login, Strava-connect (both the shared app and "bring
your own app"), import, every dashboard panel including the AI ones (via
seeded fixtures where a live Strava/Anthropic/Stripe credential isn't
available in this environment), account changes, self-service deletion,
the admin module end to end, and `next build`, all exercised against a
real local Postgres and, for the UI, a Playwright-driven browser. The
two things that are **not** tested against a live third party: a real
round trip against Strava's own servers (needs credentials only you can
create) and Stripe billing against an actual account (needs live keys —
see "Membership tiers and billing" below for exactly what was and wasn't
verified).

## Contents

- [Architecture, in one paragraph](#architecture-in-one-paragraph)
- [Feature tour](#feature-tour)
- [The "bring your own Strava app" option](#the-bring-your-own-strava-app-option--a-deliberate-tradeoff)
- [Training load and race pace — what these actually are](#training-load-and-race-pace--what-these-actually-are)
- [Deploy guide](#deploy-guide)
- [What's still simple on purpose (MVP tradeoffs)](#whats-still-simple-on-purpose-mvp-tradeoffs)
- [Local development](#local-development)

## Architecture, in one paragraph

Next.js App Router throughout, both the marketing site and the app
behind login. Accounts and sessions are Postgres + a signed cookie
(bcrypt for passwords, a JWE cookie holding just a user id) — Google
login links to the same row by email. Each user's Strava tokens live
encrypted in the database, not in a cookie, so imports and panels
survive across devices and logins. Importing pulls 5 activities per
request (2 Strava API calls each) so no single request runs long enough
to hit a serverless timeout; the dashboard loops that call up to 6 times
to cover 30 activities, with a progress bar. The four AI-assisted panels
(Overtraining Shield, training plan, training-plan deviation detection,
race-day plan) all call Claude (`lib/anthropic.js`) through the same
structured-tool-call helper, cache their output per user keyed by a hash
of their inputs, and are rate-limited by membership tier via a shared
`ai_usage` table — none of them call the model on every page load. The
admin module (`/admin`) is a second, completely separate auth system
(its own session cookie, env-var credentials, no link from the rest of
the site) layered over the same database for operator-facing analytics
and account controls.

## Feature tour

### Accounts, login, and the account page

Signup collects full name, email, date of birth, password, and password
confirmation, then emails a 6-digit code (via Resend — see env vars
below) that has to be entered before the account can log in. Accounts
require an age of 13 or older, enforced server-side. "Continue with
Google" is available on both the signup and login pages; a Google
sign-in is email-verified automatically and links to an existing
password-based account with the same email if one exists. Google's
basic profile scope doesn't include date of birth, so new Google
sign-ups are sent to the account page to confirm it there instead (also
enforced at 13+).

**Forgot password** (`/forgot-password`, `/api/auth/forgot-password`,
`/api/auth/reset-password`) sends the same kind of 6-digit code to the
account's email; the endpoint always responds success whether or not
that address has an account, so it can't be used to probe which emails
are registered. This closed what used to be this app's one real
account-recovery gap.

The **My account** page (linked from the dashboard header) lets a
logged-in user change their name, email (re-verified by code, sent to
the new address), and password; add or edit their date of birth and body
weight (both optional, both used to sharpen the AI panels and the gear
wear estimate — see below, since Strava's API doesn't expose either);
upload and crop a square profile photo (stored as a data URI in
Postgres, capped at ~1.5MB decoded — no object storage needed at this
scale); manage their Stripe subscription; and permanently delete their
account (see "Privacy, data control, and account deletion" below).

### Dashboard and Strava sync

The dashboard's Strava-connect panel defaults to the platform's shared
app (one click) with an advanced opt-in to paste your own Strava
Client ID/Secret (see the tradeoff section below). Before anything is
connected, or before 30 activities are imported, the dashboard shows a
**Getting Started guide** explaining every capability below in plain
language, so a new signup knows what connecting Strava actually buys
them.

Every page behind login shares one header (`components/AppHeader.js`):
the wordmark, a persistent primary nav (Dashboard, Training) next to it,
and the athlete's name/tier on the right, opening a dropdown — My
account, **Re-sync from Strava**, Light/dark mode, font size, Log out
(`components/UserMenu.js`) — instead of spreading those as flat links.
On narrow screens the same content collapses into a hamburger menu with
an accordion for Dashboard/Training (`components/MobileNavMenu.js`).

**Re-sync from Strava** is the one action that refreshes everything:
it re-imports up to 30 activities, then re-fetches the Overtraining
Shield panel, the Strava Summary infographic, and — if there's a saved
training plan — checks it for deviation (see below). There's no
separate manual "Refresh" button on any of those three; a re-sync is
what changes the underlying data each of them is computed from, which
is what actually triggers a fresh read.

Dashboard layout, top to bottom in the main column: Training load (race
pace prediction included), Overtraining Shield, then Strava Summary. A
sticky right-hand sidebar holds Equipment Lifecycle & Telemetry. All of
it only renders once there's data to compute from.

### Overtraining Shield

A **physics-model + LLM** hybrid, not an LLM guessing from raw numbers:

- **Physics model** (`lib/biomechanics.js`, deterministic, no API
  calls): computes **aerobic decoupling** (a Pw:HR/Pa:HR efficiency
  ratio compared between the first and second half of each sustained
  effort) and **cadence drift** (stride/pedal rate falling late in an
  effort), aggregated across rolling 7/30/60/90-day windows. Both
  numbers are shown regardless of whether the AI call below succeeds,
  fails, or is rate-limited — they cost nothing and need no LLM. This
  needs `time`, `heartrate`, `velocity_smooth`/`watts`, and `cadence`
  streams from Strava, stored (trimmed) in `activities.trace`;
  activities imported before this feature shipped need a re-sync to get
  them. The **acute:chronic workload ratio** (ACWR, from the
  training-load panel) rounds out the physics layer.
- **LLM layer** (`lib/anthropic.js`, requires `ANTHROPIC_API_KEY`):
  given the athlete's aggregated activity summary plus those
  deterministic numbers, returns a structured risk level/score,
  specific risk factors, a recovery and nutrition plan, and an optional
  `training_adjustment` — populated only when the data actually signals
  a problem, and shown as guidance with a link to the Training Plan page
  rather than rewriting the saved plan automatically.

**Age does not actually come from Strava** — its public API never
returns date of birth, for any account. The account page's optional
date-of-birth field is the only source; without it the panel says so
and reasons from training patterns alone.

Results are cached (`ai_insights` table) and only regenerated when the
underlying activity summary actually changes, subject to the
membership tier's refresh cadence. There's no manual refresh button; a
Strava re-sync is what changes the summary and triggers a fresh read.

### Strava Summary

One infographic (`lib/telemetrySummary.js` aggregates,
`lib/telemetrySummarySvg.js` draws, `/api/telemetry-summary` serves it as
SVG for the live preview or PNG for "Save as image") summarizing the
whole imported period, rather than one card per activity:

- **Total training time**, the date range, and the acute:chronic load
  figure.
- **A fatigue gauge** (`lib/fatigue.js`) — a semi-circle meter blending
  hours since the last activity (scaled by how hard that effort was)
  with a bump when ACWR is already elevated. A duration/intensity/
  recency heuristic, not a physiological measurement.
- **A training-intensity trend** across the period, using the same
  per-activity load heuristic (`estimateLoad`) the training-load panel
  uses so the two can't tell visually different stories.
- **Stat tiles** for whichever of avg heart rate / avg power / avg pace
  / avg recorded device temperature the imported activities actually
  have. Weather and humidity are **not** shown — no weather API key
  exists in this environment and Strava has no humidity field at all;
  the one real signal is Strava's occasional device-recorded
  `average_temp`.

A theme toggle (Ink/Paper/Signal) and a units toggle (metric/imperial)
apply instantly, client-side, since the whole summary is already fetched
as data.

### Last 30 Activities

A separate page (`/activities`) with the original per-activity telemetry
overlay gallery — one Strava-style post-workout card per imported
activity (`lib/svg.js`, `/api/overlay`), each with its own theme/units
controls. Each card has a **"Post to my Strava feed"** button that
renders the card as a PNG and hands it to the OS-level Web Share API
(`navigator.share`) — on a device with the Strava app installed, Strava
shows up as a share target there; Splitline itself never posts to
Strava's API on a user's behalf. Where Web Share isn't available, the
button falls back to a plain "Save as image" download with a hint to
share it manually.

### Equipment Lifecycle & Telemetry

A sticky sidebar estimating wear on the athlete's registered Strava gear
(shoes and bikes) — **entirely deterministic, no LLM call, no membership
budget spent**:

- `/api/import` fetches the athlete's **complete gear roster** (every
  piece ever registered, not just what's tagged on the last 30
  activities) once per sync, caching detail in a `gear` table. Retired
  gear is fetched (so its status stays known) but filtered from the
  display.
- `lib/equipment.js` estimates a shoe's midsole lifespan at 700km,
  scaled down for body weight above a 70kg reference (self-reported,
  optional), and a bike's chain-wear mileage at a flat 3000km. 85%+ is
  "nearing replacement", 100%+ is "replace soon"; the list sorts by
  mileage. Shoes and bikes have their own tabs.
- Flagged gear gets a **"Shop replacement options"** link — a plain
  Google Shopping search built from brand/model, opened in a new tab.
  No affiliate account, no automated purchase.

### Training plan for an upcoming event

The **Training plan** page lets an athlete set one upcoming event — a
running race, duathlon, or triathlon, with a distance and goal-time band
scoped to that event type (`lib/eventTypes.js`). `/api/training-plan`
sends the aggregated activity summary plus the event details to Claude
(`generateTrainingPlan`), which returns a periodized plan:

- **3-8 phases** (e.g. Base/Build/Peak/Taper) spanning the full time to
  the event, each with its focus, weekly volume guidance, a weekly
  time-commitment estimate, key workouts, and a `relative_load` value
  (0-100) consistent phase to phase.
- A **training-progress chart** (`lib/progressChart.js`) plotting
  `relative_load` across phases, colored from the current theme.
- Detailed recovery guidelines, a nutrition plan, pre-race preparation,
  and a race-day strategy.

The plan is cached (`training_plans` table) and only regenerated when
the goal or the activity data changes, or via "Refresh plan". Setting a
new event clears the cached plan (but not the tier's refresh clock —
see "Membership tiers" below).

### Comparing actual training against the plan

Every re-sync also checks whether actual training since the current plan
was generated has drifted from what the plan called for.
`lib/trainingPlanDeviation.js` buckets activities imported since the
plan's `generated_at` into calendar weeks, and
`/api/training-plan/deviation` hands those — plus the plan's own phases
(guidance text, not rigid per-week numbers) and the athlete's
training-load/biomechanics signals — to a dedicated Claude call,
`generateTrainingPlanDeviation`. Since the plan itself is guidance
ranges rather than fixed numeric targets, there's no strict formula for
"10% off plan": the model makes that judgment call directly, the same
way it judges risk level elsewhere. It returns which of distance, pace,
power, heart rate, or fatigue look off by roughly 10% or more, a
week-by-week status ("on track"/"missed"/"exceeded"/"insufficient data")
matched to the plan's phase names, and a likelihood assessment of
whether the drift threatens the event goal.

A significant deviation surfaces as an alert panel at the top of the
dashboard with three choices: **regenerate** the plan from scratch,
**adjust** its upcoming phases around the deviation
(`generateAdjustedTrainingPlan`, same output shape as a fresh plan), or
**continue** as-is. Continuing marks the deviation `acknowledged`
(`training_plan_deviations` table) without touching the plan, and the
Training Plan page then annotates each affected phase with the specific
weeks that were off and by how much, plus the goal-impact analysis. This
check shares the training-plan feature's own tier-based rate limit
rather than getting one of its own, and silently skips (no locked-state
UI) when the tier isn't eligible, since it's a background check, not a
user-clicked action. A new plan — regenerated, adjusted, or from a
changed goal — always clears any prior deviation record.

### Race-day plan

Under **Training → Race-day plan**, a page that turns the saved event
plus race-day conditions entered by hand into an AI pacing and fueling
plan (`generateRaceDayPlan`): overall pacing strategy, target pace per
segment, timed fueling/hydration, heat/altitude adjustments, a pre-race
checklist, and contingencies. Cached and tier-gated exactly like the
training plan (`race_day_plans` table, `ai_usage` feature `race_day`).

`lib/raceDay.js` derives a grade-adjusted pace factor from the athlete's
own flat-vs-hilly run history when there's enough of it, falling back to
a documented ~3%-per-1%-grade heuristic otherwise. Three things from
common "race day" feature requests are **not** built, and don't have a
reasonable path inside a web dashboard: GPX course upload (course
elevation gain is a plain number the athlete enters), a live weather
pull (no weather API key in this environment; temperature/humidity are
entered by hand), and real-time audio cues during the actual race (needs
a native/mobile companion app; the plan instead renders on-page and
downloads as a text pace/fueling sheet).

### Sharing and exporting panels

The Overtraining Shield panel, the training plan, and the race-day plan
each have a **Share** button (`components/ShareButton.js`) that exports
the panel as a professionally formatted, Splitline-branded **PDF or
PNG** with a QR code back to the site — `lib/shareContent.js` turns each
panel's already-fetched data into a shared content model,
`lib/shareCard.js` renders it (SVG for PNG, `pdf-lib` for PDF),
`/api/share` serves either format. Every export is tracked
(`export_share` usage event) for the admin module's analytics.

### Appearance and accessibility

A theme toggle (light/dark) is on every page — a standalone button on
the marketing/auth/account pages, a menu item in the dashboard's user
menu. Both write `data-theme` on `<html>` and persist to
`localStorage`, applied before first paint by an inline script in
`app/layout.js` to avoid a flash of the wrong theme. Light mode reuses
the same warm-paper palette as the "paper" overlay-card theme.

A +/-/reset **font size** control lives in the same user menu, writing a
`--fs-scale` CSS custom property that every `font-size` in `globals.css`
is expressed as a multiple of — same before-first-paint treatment, same
per-browser persistence.

### Membership tiers and billing

Every account starts on **Free**. The three tiers (`lib/membership.js`)
don't gate feature *access* — they gate how often the AI panels
(Overtraining Shield, training plan, race-day plan, and the
training-plan deviation check, which shares the training-plan budget)
are allowed to actually call Claude, since that's the real cost driver:

| Tier | Price | AI refresh cadence |
|---|---|---|
| Free | $0 | once every 90 days |
| Plus | $1.99/mo or $19.99/yr | once every 30 days |
| Pro | $2.99/mo or $29.99/yr | unlimited |

Enforced server-side (`isRefreshEligible`/`nextEligibleDate`), backed by
an `ai_usage` table recording the last time each feature *actually
generated*, independent of what's cached — changing a training-plan
goal doesn't reset this clock, or a free-tier user could bypass the
90-day limit by re-entering their event. `resolveEffectiveTier()` is the
only place a stored tier's expiry actually gets resolved (on every
read) — there's no cron job downgrading lapsed accounts.

New signups (password or Google) get **Pro tier free for
`NEXT_PUBLIC_BETA_PRO_TRIAL_DAYS` days** (default 90) via the same
`tier`/`tier_expires_at` mechanism as a paid subscription — no separate
"trial" concept. Set it to `0` to turn the promo off for new signups;
the home page's pricing section reads the same constant.

**Stripe billing**: upgrading (`/api/billing/checkout`) creates a
Checkout Session with the price built inline via `price_data`
(`lib/pricing.js` is the only file to edit to change pricing) rather
than a pre-created Stripe Price object. A "Manage billing" link opens
Stripe's hosted Customer Portal for payment methods, invoices, and
cancellation — not plan switching, which goes back through a fresh
Checkout session instead. `/api/stripe/webhook` handles
`checkout.session.completed`, `invoice.payment_succeeded`, and
`customer.subscription.deleted`. **This has not been tested against a
real Stripe account** — no live key exists in this environment; the
integration is written against the installed SDK's actual types, but
run a real test-mode checkout end to end before trusting it with real
cards.

### Admin module

`/admin` is a small operator-only dashboard — env-var credentials
(`ADMIN_USERNAME`/`ADMIN_PASSWORD`), a completely separate session
cookie from user logins (no user account, however created, can ever
reach it), no link to it from the rest of the site, and excluded via
`robots.txt` as a second layer on top of the auth itself.

- **Overview** (`/admin`): total users and their membership tier
  breakdown, site-wide feature-usage totals (re-syncs, AI refreshes,
  plan generations, exports), a device/browser split, and a table of
  every user linking to their detail page.
- **Per-user detail** (`/admin/users/[id]`): that user's tier, join
  date, activity count, a full usage-event breakdown and recent-activity
  log, and a **Membership panel** to set their tier and expiry date
  directly — bypassing Stripe entirely (mirrors the beta-trial comp
  pattern), so it composes with rather than conflicts with real billing:
  an existing paid subscription keeps renewing/cancelling via Stripe
  webhooks regardless of what the override sets.
- **Churned users** (`/admin/churned`): when someone deletes their own
  account (see below), a snapshot of who they were and why they left is
  kept here specifically so the operator can follow up for feedback —
  name, email, tier at the time, signup date, activity count, a usage
  summary, and an optional free-text reason from the deletion form. The
  operator can mark a record contacted, leave notes, or purge it
  outright once follow-up is done (or a former user asks for even this
  to be erased — see below).

Every route under `/api/admin/*` re-checks the admin session
independently; there is no code path from a user session to an admin
one.

### Privacy, data control, and account deletion

The account page's **Danger zone** lets an athlete permanently delete
their own account — immediately and irreversibly erasing their profile,
every imported activity, gear record, training and race-day plan, and
cached AI insight (every table with a `user_id` column cascades on
delete). The one disclosed exception: name, email, membership tier, and
a usage summary (not the activities or plans themselves) are retained in
the admin module's churned-users list, specifically so the operator can
follow up about the athlete's reason for leaving — an optional field on
the deletion form itself. Both the deletion confirmation screen and the
[Privacy Policy](app/privacy/page.js) disclose exactly what's retained
and offer an email-based opt-out to erase that too.

`/privacy` and `/terms` are full, plain-language policy pages linked
from every page's footer (`components/SiteFooter.js`); the contact
address on both is configurable via `CONTACT_EMAIL` rather than
hardcoded.

### Marketing site

The signed-out home page (`app/page.js`) has a two-column hero with a
telemetry-card visual, a "see it land on your feed" social-proof mockup,
a feature grid, and (when the beta trial is active) a promo banner —
pricing itself lives on its own `/pricing` page rather than crowding the
home page. All of it, plus every page behind login, shares one
`<title>`/description pattern and one footer.

## The "bring your own Strava app" option — a deliberate tradeoff

The dashboard's Strava-connect panel defaults to the platform's shared
app (one click, zero setup) and offers an **advanced, opt-in** toggle
for a user to paste their own Strava Client ID/Secret instead. I built
it because you asked for it, but it's worth knowing why it's not the
default: making every new user register their own Strava API
application before they can use the product is real friction, and it
directly works against the "lightweight, viral" goal from earlier in
this build.

The actual reason "bring your own app" is useful is **rate limits**:
Strava's default app-wide limit is 100 requests/15min and 1000/day, and
importing 30 activities costs ~60 calls per user (2 per activity). One
shared app serving many people will hit that ceiling well before any
one user does. Two ways to handle it as you grow:

- **Request a rate limit increase** from Strava once you have real
  usage (there's a request form linked from your app's settings page)
  — this is the normal path and keeps the product one-click for
  everyone.
- Leave "bring your own app" available as a release valve for power
  users who want to guarantee their imports never queue behind anyone
  else's.

I'd watch your shared app's usage (Strava's API dashboard shows current
rate-limit consumption) before assuming this needs solving at all.

## Training load and race pace — what these actually are

`lib/insights.js` computes two things from a user's own imported
activities, both openly heuristic:

- **Training load**: a duration × intensity proxy (heart rate, falling
  back to power, then pace) rolled into a 7-day/28-day acute:chronic
  ratio. This is *not* real TRIMP (that needs resting/max HR, which
  Strava's API doesn't hand over) and it's *not* a medical or coaching
  assessment — a commonly-cited sports-science rule of thumb, and the
  returned `note` field says so.
- **Race pace**: Riegel's formula (`T2 = T1 * (D2/D1)^1.06`) applied to
  the user's fastest sustained recent run. Well-known, still a rough
  estimate — taper, weather, and terrain all move the real result.

What's built is a **recomputed-on-demand** panel, refreshed whenever
activities are re-imported — not a real-time push from Strava's
webhook API (`POST /push_subscriptions`), which would need a background
worker this serverless build doesn't have, and not the product
autonomously rewriting someone's future training plan on its own (the
training-plan deviation feature above surfaces the drift and lets the
athlete decide, deliberately stopping short of an unreviewed automatic
change).

## Deploy guide

### 1. Register a Strava API application

<https://www.strava.com/settings/api> → note the **Client ID** and
**Client Secret** → set **Authorization Callback Domain** to your
Vercel domain (bare domain, no scheme/path). This is the *platform*
app — the one every user gets by default with one click.

### 2. Provision a Postgres database

Any of these work — the code only uses standard `pg`, nothing
provider-specific:

- **Vercel Postgres**: Project → Storage → Create Database → Postgres.
  Vercel injects a `DATABASE_URL`-compatible connection string
  automatically when you link it to the project (check the exact env
  var name it creates — `POSTGRES_URL` in some plans — and either use
  that name or add a `DATABASE_URL` env var pointing to the same value).
- **Neon** (neon.tech) or **Supabase**: create a project, copy the
  connection string (the pooled one, for serverless) into `DATABASE_URL`.

Then run the schema once:

```bash
psql "$DATABASE_URL" -f schema.sql
```

(Or paste `schema.sql`'s contents into your provider's SQL editor —
Neon, Supabase, and Vercel Postgres all have one.) `schema.sql` is safe
to re-run any time the code adds a new table/column — every statement is
`IF NOT EXISTS`, so re-running it against an existing database only ever
adds what's missing.

Sanity-check the connection and the encryption round-trip before
deploying:

```bash
DATABASE_URL="..." ENCRYPTION_KEY="..." node scripts/smoke-test-db.mjs
```

It creates one throwaway user, verifies things decrypt correctly, and
deletes everything it made. All five lines should print `✓`.

### 3. Set environment variables in Vercel

| Name | Value |
|---|---|
| `STRAVA_CLIENT_ID` | from step 1 |
| `STRAVA_CLIENT_SECRET` | from step 1 |
| `SESSION_SECRET` | random 32+ chars — `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | random 32+ chars — a **different** value than `SESSION_SECRET` |
| `DATABASE_URL` | from step 2 |
| `RESEND_API_KEY` | from [resend.com](https://resend.com) — sends signup/email-change/password-reset verification codes. Without it, codes are just logged to the server console (fine for local dev, not production). |
| `EMAIL_FROM` | optional — the From address for those emails, e.g. `Splitline <noreply@yourdomain.com>` (must be a domain verified in Resend) |
| `CONTACT_EMAIL` | optional — the address `/privacy` and `/terms` point people to for data requests and legal notices, and where a former user can ask to have their churned-user record erased too. Defaults to a placeholder — set this before a real launch. |
| `SITE_URL` | optional — the canonical URL the QR code on shared PDF/PNG exports points back to. Defaults to a placeholder — set this to your real domain. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional — from [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) (OAuth client ID, type "Web application", authorized redirect URI `https://your-domain/api/auth/google/callback`). Without these, the "Continue with Google" buttons redirect to an error instead of Google. |
| `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com) — powers the Overtraining Shield panel, the training plan, its deviation-detection check, and the race-day plan. Without it, those just show "couldn't generate"; the rest of the app is unaffected. |
| `STRIPE_SECRET_KEY` | from the Stripe dashboard → Developers → API keys — powers Plus/Pro checkout and the billing portal. Without it, upgrade buttons return a clear "billing not configured" error; Free tier and everything else work fine. |
| `STRIPE_WEBHOOK_SECRET` | from Stripe dashboard → Developers → Webhooks → your endpoint's "Signing secret", after pointing an endpoint at `/api/stripe/webhook` — see "Membership tiers and billing" above for which events to subscribe it to. |
| `NEXT_PUBLIC_BETA_PRO_TRIAL_DAYS` | optional — how many days of free Pro tier new signups get (default 90; `0` turns the promo off). Must keep the `NEXT_PUBLIC_` prefix — the home page's beta banner reads it in the browser, and Next only exposes prefixed env vars there, inlined at build time (so a value change needs a redeploy either way). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | credentials for `/admin` — a separate module for the site operator only, not a user account and not linked from anywhere in the normal app. Without both set, `/admin/login` returns "not configured" and nobody can sign in. |

### 4. Push to Git, import into Vercel, deploy

Push this folder to a repo, `vercel.com/new` → import → deploy.
Framework auto-detects as Next.js.

### 5. Point Strava's callback domain at the real URL, then test

Update the Strava app's Authorization Callback Domain to your actual
Vercel domain. Open the site, sign up, connect Strava, import.

## What's still simple on purpose (MVP tradeoffs)

- **No webhook / auto-import.** Someone has to click Import (or
  Re-sync). Strava's push-subscription API would close that gap.
- **Stripe billing is untested against a live account.** The checkout,
  portal, and webhook code is complete and was checked against the
  installed `stripe` SDK's own type definitions, but no test-mode Stripe
  keys were available in this environment, so none of it has been
  exercised against Stripe's actual API. Run a real test-mode checkout
  before trusting it with payments.
- **No proration on plan switches.** Each "Subscribe" click starts a
  fresh Checkout Session; a user switching Plus → Pro (or monthly →
  yearly) ends up with two subscriptions unless the old one is
  cancelled first via the billing portal.
- **No dunning / `past_due` handling.** A failed renewal charge doesn't
  currently downgrade the user or prompt them until the subscription is
  fully cancelled.
- **Gear data only populates on (re-)import.** Activities imported
  before the Equipment Lifecycle feature shipped won't show gear until
  the athlete hits Re-sync.
- **Decoupling/cadence-drift and the training-plan deviation check both
  need enough real data to say anything.** Short/interval activities,
  or ones missing the right streams, don't produce a reading; a plan
  younger than a week, or with no new activity since it was generated,
  simply isn't checked yet.
- **The grade-adjustment factor behind the race-day plan is coarse.**
  Derived from whole-activity average pace/elevation, not per-kilometer
  splits (none are stored) — a directional comparison, not a
  Strava-grade-adjusted-pace-equivalent calculation.
- **No live weather, no GPX upload, no real-time race-day audio** — see
  "Race-day plan" above for why each doesn't have a reasonable path
  inside a web dashboard.
- **Avatars are stored as data URIs in Postgres, not object storage.**
  Fine at this scale (capped ~1.5MB decoded); would need to move to
  blob storage well before that becomes a real constraint.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values you need for what you're testing
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

`.env.example` lists every variable this app reads, each with a comment
on what breaks (if anything) when it's left unset — you don't need all
of them for local work, just `DATABASE_URL`, `SESSION_SECRET`, and
`ENCRYPTION_KEY` at minimum (verification codes fall back to the server
console without `RESEND_API_KEY`).

For local Strava OAuth testing, set the app's Authorization Callback
Domain to `localhost` (Strava allows this). For local admin testing, set
`ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env.local` too.
