# Splitline (web) — multi-tenant deploy guide

This version supports many users: sign up, log in, connect your own
Strava account, import your last 30 activities, and get a telemetry
overlay card for each one. It's also still a hosted MCP connector at
`/api/mcp`.

Every piece below was actually run, not just written: signup → session
→ logout → login, both Strava-connect paths (shared app and "bring your
own app"), the import route's rejection when Strava isn't connected yet,
overlay rendering, and the insights endpoint's empty state — all tested
against a real local Postgres, and `next build` passes clean. The one
thing that is **not** tested is a real round trip against Strava's
servers, because that needs credentials only you can create.

## Architecture, in one paragraph

Accounts and sessions are Postgres + a signed cookie (bcrypt for
passwords, a JWE cookie holding just a user id). Each user's Strava
tokens live encrypted in the database, not in a cookie — so imports and
overlays survive across devices and logins. Importing pulls 5
activities per request (2 Strava API calls each) so no single request
runs long enough to hit a serverless timeout; the dashboard loops that
call up to 6 times to cover 30 activities, with a progress bar. Overlay
images render from the stored data, not a live Strava call, so the
gallery and the theme/metric toggles are instant.

## Out-of-band steps

### 1. Register a Strava API application

Same as before: <https://www.strava.com/settings/api> → note the
**Client ID** and **Client Secret** → set **Authorization Callback
Domain** to your Vercel domain (bare domain, no scheme/path). This is
the *platform* app — the one every user gets by default with one click.

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
Neon, Supabase, and Vercel Postgres all have one.)

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
| `RESEND_API_KEY` | from [resend.com](https://resend.com) — sends the signup/email-change verification codes. Without it, codes are just logged to the server console (fine for local dev, not for production). |
| `EMAIL_FROM` | optional — the From address for those emails, e.g. `Splitline <noreply@yourdomain.com>` (must be a domain verified in Resend) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional — from [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) (OAuth client ID, type "Web application", authorized redirect URI `https://your-domain/api/auth/google/callback`). Without these, the "Continue with Google" buttons redirect to an error instead of Google. |
| `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com) — powers the injury-risk/recovery/nutrition panel and the training plan. Without it, those just show "couldn't generate"; the rest of the app is unaffected. |
| `STRIPE_SECRET_KEY` | from the Stripe dashboard → Developers → API keys — powers Plus/Pro checkout and the billing portal. Without it, upgrade buttons return a clear "billing not configured" error; Free tier and everything else work fine. |
| `STRIPE_WEBHOOK_SECRET` | from Stripe dashboard → Developers → Webhooks → your endpoint's "Signing secret", after pointing an endpoint at `/api/stripe/webhook` — see "Stripe billing" below for which events to subscribe it to. |
| `NEXT_PUBLIC_BETA_PRO_TRIAL_DAYS` | optional — how many days of free Pro tier new signups get (default 90; `0` turns the promo off). Must keep the `NEXT_PUBLIC_` prefix — the home page's beta banner reads it in the browser, and Next only exposes prefixed env vars there, inlined at build time (so a value change needs a redeploy either way). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | credentials for `/admin` — a separate module for the site operator only, not a user account and not linked from anywhere in the normal app. Without both set, `/admin/login` returns "not configured" and nobody can sign in. |

### Admin module

`/admin` is a small operator-only dashboard: total users and their membership tier, and a per-user usage breakdown (Strava re-syncs, AI Biomechanical Shield refreshes, training-plan and race-day-plan generations, PDF/PNG/Strava-feed exports) plus a site-wide device/browser split. It signs in with `ADMIN_USERNAME`/`ADMIN_PASSWORD` only — there's no link to it from the rest of the site, it's excluded via `robots.txt`, and its session is a completely separate cookie from user logins, so no user account (however it was created) can ever reach it.

### 4. Push to Git, import into Vercel, deploy

Same as before: push this folder to a repo, `vercel.com/new` → import →
deploy. Framework auto-detects as Next.js.

### 5. Point Strava's callback domain at the real URL, then test

Update the Strava app's Authorization Callback Domain to your actual
Vercel domain. Open the site, sign up, connect Strava, import.

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

- **Training load**: a duration × intensity proxy (heart rate,
  falling back to power, then pace) rolled into a 7-day/28-day
  acute:chronic ratio. This is *not* real TRIMP (that needs resting/max
  HR, which Strava's API doesn't hand over) and it's *not* a medical or
  coaching assessment — it's a commonly-cited sports-science rule of
  thumb, and the returned `note` field says so; keep that note visible
  in any UI that shows the number.
- **Race pace**: Riegel's formula (`T2 = T1 * (D2/D1)^1.06`) applied to
  the user's fastest sustained recent run. Well-known, still a rough
  estimate — taper, weather, and terrain all move the real result.

"Real-time" and "autonomous" were in the original ask; what's actually
built is a **recomputed-on-demand** panel, refreshed whenever activities
are re-imported. True real-time would mean Strava's push-webhook API
(`POST /push_subscriptions`) driving a background worker that updates
the dashboard the moment a workout finishes — a genuinely different
piece of infrastructure (a queue, a running process, not just
serverless functions) that isn't in this build. "Autonomous" in the
sense of the product adjusting someone's *future* training plan on its
own is further still — that's a training-plan engine, not a dashboard
panel. Both are reasonable v2 directions, not implied by what's here.

## Accounts: signup, Google login, and the account page

Signup collects full name, email, date of birth, password, and password
confirmation, then emails a 6-digit code (via Resend — see env vars
above) that has to be entered before the account can log in. Accounts
require an age of 13 or older — signup is rejected server-side (not just
in the UI) for anyone younger. "Continue with Google" is available on
both the signup and login pages; a Google sign-in is email-verified
automatically (Google already confirmed it) and links to an existing
password-based account with the same email if one exists. Google's basic
profile scope doesn't include date of birth, so the age check can't run
at that point — new Google sign-ups are instead sent to the account page
with a prompt to confirm their date of birth there (also enforced at 13+).

Logged-in users get a **My account** page (linked from the dashboard
header) to change their name, email (also re-verified by code, sent to
the *new* address), and password. There's still no self-service
"forgot password" flow — add one before a public launch if you don't
want support tickets over locked-out accounts.

## Dashboard layout

Main column, top to bottom: Training load, Biomechanical &amp;
Overtraining Shield, then Telemetry overlays. A right-hand sidebar
(sticky — stays in view as the main column scrolls, with its own
independent scroll once the list is tall) holds Equipment Lifecycle
&amp; Telemetry. All of it only renders once there's data to compute
from (Strava connected, activities imported).

## Telemetry overlays: one summary infographic, not 30 cards

This used to be a gallery of 30 individual per-activity cards (one
telemetry overlay per imported activity). It's now a single infographic
summarizing the whole imported period instead — `lib/telemetrySummary.js`
aggregates every stored activity into one bundle, `lib/telemetrySummarySvg.js`
draws it, and `/api/telemetry-summary` serves it as SVG (for the on-page
preview — being vector, it scales cleanly to any container width, which
is what makes it "responsive" without a second rendering path) or PNG
(for the "Save as image" button, via the same `lib/renderPng.js`
rasterizer the rest of the app uses). The per-activity overlay engine
(`lib/svg.js`, `/api/overlay`) wasn't touched — it's still what
`/api/mcp` (the hosted MCP connector) uses for a single activity.

The infographic has three parts:

- **Total training time**, the date range it spans, and the
  acute:chronic load figure from the training-load panel.
- **A fatigue gauge** (`lib/fatigue.js`) — a semi-circle meter, needle
  position from a 0-100 score. Deterministic, not measured: it blends
  how many hours since the last activity ended (scaled by how hard that
  last effort was relative to the athlete's own recent average — a
  harder effort keeps the needle further right for longer) with a bump
  when the acute:chronic ratio is already elevated. It's a duration/
  intensity/recency heuristic from the athlete's own history, the same
  honest framing as the training-load panel it borrows from — not a
  physiological measurement (no HRV, no resting-HR baseline).
- **A training-intensity trend** across the period — the same
  per-activity load heuristic the training-load panel uses
  (`estimateLoad`, exported from `lib/insights.js` so the two panels
  can't tell visually different stories from two different formulas),
  charted chronologically. Needs at least 2 activities to draw a line;
  with only 1, it says so instead of showing a broken chart.
- **Stat tiles** for whichever of avg heart rate / avg power / avg pace
  the imported activities actually have.

**Weather and humidity are not shown.** The original ask was for
weather/humidity "across all the activity location," but there's no
weather API key in this environment (the same gap noted for the
race-day plan) and Strava's API has no humidity field at all. The one
real signal available is `average_temp` — a device-recorded temperature
Strava occasionally returns when the recording device had a sensor —
now captured on import (`activities.avg_temp_c`) and averaged into a
"Avg recorded temp" tile when enough activities have it. This is
explicitly not live weather and the UI doesn't claim otherwise.

## Overtraining Shield — and a real limitation on "age from Strava"

The dashboard's "Overtraining Shield" panel (formerly "Biomechanical &
Overtraining Shield" — renamed for brevity, same feature) is a
**physics-model + LLM** hybrid, not an LLM guessing from raw numbers:

- **Physics model** (`lib/biomechanics.js`, deterministic, no API
  calls): computes **aerobic decoupling** (a Pw:HR/Pa:HR efficiency
  ratio compared between the first and second half of each sustained
  effort — cardiac drift for the same output is a well-known aerobic-
  fatigue signal) and **cadence drift** (stride/pedal rate falling late
  in an effort, a form-breakdown proxy), aggregated across rolling
  7/30/60/90-day windows of whatever's actually been imported. Both
  numbers are shown directly on the dashboard regardless of whether the
  AI call below succeeds, fails, or is rate-limited — they cost nothing
  and need no LLM to be useful. This needs `time`, `heartrate`,
  `velocity_smooth`/`watts`, and `cadence` streams, which `/api/import`
  now requests from Strava and stores (trimmed, like the existing
  elevation/heart-rate/power arrays) in `activities.trace`; activities
  imported before this feature shipped won't have them until re-synced.
  The **acute:chronic workload ratio** (ACWR, from the training-load
  panel) rounds out the physics layer — above ~1.5 is a commonly-cited
  sudden-spike injury-risk range.
- **LLM layer** (`lib/anthropic.js`, Claude, requires
  `ANTHROPIC_API_KEY`): given the athlete's aggregated activity summary
  *plus* those deterministic decoupling/cadence/ACWR numbers, returns a
  structured risk level/score, specific risk factors (grounded in the
  actual physics numbers when they're notable), a recovery and nutrition
  plan, and an optional `training_adjustment` — a few concrete near-term
  training tweaks, populated only when the data actually signals a
  problem. This is a wellness heuristic written by an LLM, not a medical
  assessment, and the UI keeps that disclaimer visible.

`training_adjustment` deliberately does **not** rewrite the athlete's
saved training plan automatically — it's shown as guidance with a link
to the Training plan page. Auto-mutating a saved plan from a background
signal is exactly the kind of surprising, hard-to-review automated
action this app avoids; a human confirms the change instead.

**Age does not actually come from Strava.** Strava's public API
(`GET /athlete`) does not return date of birth for any account — it
never has, for privacy reasons — so there is no field `lib/strava.js`
could read to compute age. Instead, the account page has an optional
"date of birth" field the athlete fills in themselves; if it's set, age
is passed to the model, and if not, the panel says so and reasons from
training patterns alone rather than guessing. This is the honest
tradeoff for a feature described as "getting age from Strava" — that
data point isn't available from Strava at all.

Results are cached per user (`ai_insights` table) and only regenerated
when the underlying activity summary actually changes — the model isn't
called on every page load. There's no manual "Refresh" button; in
practice this means a "Re-sync from Strava" is what refreshes the
panel, since that's what changes the activity summary the input hash is
computed from (subject to the same tier-based rate limit either way).

## Equipment Lifecycle & Telemetry

A sidebar (sticky, right-hand side, scrolls independently once the list
is tall) estimating wear on all of the athlete's registered Strava gear
(shoes and bikes) — **entirely deterministic, no LLM call**: the
underlying logic (mileage ÷ a lifespan threshold) is formulaic rule
evaluation, not something a language model improves, so this panel
costs nothing against the membership tiers' AI budget.

- `/api/import` fetches the athlete's **complete gear roster** via
  `GET /athlete` (which returns `shoes`/`bikes` arrays — every piece of
  gear ever registered — only for the token's own owner) once per
  import/re-sync run, then `/gear/{id}` per item for full detail (name,
  brand, model, lifetime distance, retired status), caching all of it in
  a `gear` table. This runs regardless of what's tagged on the 30
  imported activities — deriving gear purely from `activity.gear_id`, as
  an earlier version of this feature did, would silently miss anything
  the athlete hadn't worn in their last 30 activities. Gear the athlete
  has marked **retired** on Strava is fetched too (so its status stays
  known) but filtered out of what the panel displays — a retired shoe
  isn't something that still needs replacing.
- `lib/equipment.js` estimates a shoe's midsole lifespan at 700km by
  default, scaled down for body weight above a 70kg reference (self-
  reported, optional — same "Strava doesn't expose this" reasoning as
  birth date, see above; account page has a "Body weight" field), and a
  bike's chain-wear mileage at a flat 3000km. 85%+ of that threshold is
  flagged "nearing replacement", 100%+ "replace soon", matching the
  original spec's 85% figure. The list sorts by mileage, so whatever
  needs replacing soonest sits at the top of the sidebar.
- Flagged gear gets a **"Shop replacement options"** link — a plain
  Google Shopping search built from the gear's brand/model, opened in a
  new tab. This is deliberately informational only: no affiliate
  account, no automated purchase, no real transaction of any kind.
  Automating an actual purchase — spending the athlete's money without
  them explicitly clicking through and choosing — is exactly the kind
  of irreversible action this app avoids taking on someone's behalf.

## Race-day plan

Under the top nav's **Training** menu, a page that turns the athlete's
saved event (from Training plan) plus race-day conditions they enter
themselves into an AI-generated pacing and fueling plan
(`lib/anthropic.js`'s `generateRaceDayPlan`, requires
`ANTHROPIC_API_KEY`): overall pacing strategy, target pace per segment,
a timed fueling/hydration plan, heat/altitude adjustments, a pre-race
checklist, and contingency notes. Tier-gated and cached exactly like the
training plan (`race_day_plans` table, `ai_usage` feature `race_day`) —
regenerating only actually calls Claude when the goal, the athlete's
activity data, or the entered conditions have changed.

`lib/raceDay.js` derives a **grade-adjusted pace factor** — how much
this specific athlete's pace slows per 1% of average uphill grade —
from their own flat-vs-hilly run history when there's enough of it
(`basis: "athlete_history"`), falling back to a documented ~3%-per-1%
heuristic otherwise (`basis: "default_heuristic"`); the LLM is told
which basis was used. This is intentionally simpler than a true grade-
adjusted-pace model: only whole-activity average distance/elevation/time
are stored, not per-kilometer splits, so it's a coarse comparison, not a
Strava-grade-adjusted-pace-equivalent calculation.

Three things in the original spec for this feature are **not** built,
and don't have a reasonable path to being built inside a Next.js web
dashboard:

- **No GPX course upload.** The athlete enters total course elevation
  gain as a plain number instead of uploading a course file for the app
  to parse.
- **No live weather pull.** No weather API key exists in this
  environment; the athlete enters an expected temperature/humidity
  themselves rather than the app fetching a forecast.
- **No real-time audio cues.** That needs a native/mobile companion
  app doing GPS-triggered audio playback *during* the actual race — a
  fundamentally different piece of software than a web dashboard can
  provide. The plan instead renders on-page and downloads as a plain
  text pace/fueling sheet.

## Light/dark appearance

A theme toggle appears on every page: a standalone button
(`components/ThemeToggle.js`) on the marketing/auth/account pages, and as
a "Light mode"/"Dark mode" item inside the dashboard's user menu
(`components/UserMenu.js` — see below) so it doesn't compete with that
page's own toggles. Both write `data-theme` on `<html>` and persist the
choice to `localStorage` — there's no server-side account setting for it,
so it's per-browser, not per-account. An inline script in `app/layout.js`
applies the stored theme before first paint to avoid a flash of the wrong
colors; that script intentionally runs before React hydrates, which is
why `<html>` carries `suppressHydrationWarning`. Light mode reuses the
same warm-paper palette as the "paper" overlay card theme, so the brand
stays consistent across both surfaces.

Every page behind login shares one header (`components/AppHeader.js`):
the wordmark, a persistent primary nav (Dashboard, Training) next to it
(`components/TopNav.js`), and the athlete's name/tier on the right, which
opens a dropdown (My account, Light/dark mode, font size, Log out)
instead of spreading those as flat links — `components/UserMenu.js`.

## Training plan for an upcoming event

The top nav's **Training** menu has a **Training plan** link that takes
an athlete to set one upcoming event
— a running race, duathlon, or triathlon, with a required name, a
distance chosen from a dropdown scoped to that event type, and a goal
finish time chosen from a dropdown scoped to that distance
(`lib/eventTypes.js` is the single source of truth for all of this, for
both the form and the server-side validation in `/api/event`):

- **Running:** 5K, 10K, Half Marathon, Marathon, Ultra (50K+) — each with its own goal-time bands
- **Duathlon:** Sprint (5K run – 30K bike – 5K run), Standard (10K–60K–10K)
- **Triathlon:** Sprint, Olympic Distance, Half Ironman (70.3), Full Ironman (140.6)

Goal time is a coarse band ("1:45–2:00", "Under 3:00", …) rather than a
raw duration picker — enough for the AI plan to target a real pace
without turning the form into two more dropdowns, and "No specific goal —
just finish" is always an option. The event date has to be at least 4
weeks out (enforced server-side, so there's room for a real progressive
plan).

Once set, `/api/training-plan` sends the same aggregated activity summary
used by the injury-risk panel, plus the event type, distance, goal time,
and exact weeks remaining, to Claude, which returns a detailed periodized
plan (`lib/anthropic.js`'s `generateTrainingPlan`):

- **3-8 phases** (e.g. Base/Build/Peak/Taper) spanning the full time to
  the event — grouped into phases rather than one entry per week, since
  that range can be a month or most of a year — each with its focus,
  weekly volume guidance, a **weekly time-commitment estimate** (e.g.
  "5-7 hours/week"), key workouts, and a `relative_load` value (0-100)
  the model assigns consistently phase to phase.
- A **training-progress chart** (`lib/progressChart.js`) plotting that
  `relative_load` across phases as a line/area illustration, rendered
  inline on the training-plan page and colored from the current theme —
  the site's own accent color as the one series (a single series needs no
  legend; the "Training progress" heading names it). It isn't part of the
  image-export feature above, which is scoped to the two dashboard panels.
- Detailed recovery guidelines, a nutrition plan, pre-race preparation
  (48-72h out), and a race-day strategy — 5-8 bullets each, with pacing
  in the race-day strategy tied to the chosen goal time when one was set.

Like the injury panel, the plan is cached (`training_plans` table) and
only regenerated when the goal or the underlying activity data changes,
or via the page's "Refresh plan" button. Setting a new event clears any
previously cached plan.

This is the heaviest AI call in the app (a bigger structured schema than
the injury panel, now bigger still with the richer per-phase detail), so
it runs at `effort: "medium"` rather than `"high"` and `max_tokens: 6000`
to leave headroom for the longer output — `/api/training-plan` sets
`maxDuration = 60`, but **that ceiling only applies on Vercel's Pro plan
or above; the Hobby plan hard-caps every serverless function at 10
seconds regardless of what the code requests**, and a slow AI call that
gets killed mid-flight used to come back as an empty response that broke
`res.json()` client-side with a raw "Unexpected end of JSON input" error.
Both `/api/event` and `/api/training-plan` now wrap their logic in
try/catch so an unexpected failure — including a Postgres "relation ...
does not exist" error from `schema.sql` not having been (re-)run yet,
detected by `lib/db.js`'s `friendlyDbErrorMessage` and turned into an
actionable message — always returns a proper JSON error instead of a raw
connection cutoff, and the client (`safeJson` in
`app/training-plan/page.js`) parses defensively either way. But if
training-plan generation times out consistently despite that, the Hobby
plan's 10-second cap is the first thing to check — the richer plan this
version generates makes that more likely to bite, not less.

### Comparing actual training against the plan

Every "Re-sync from Strava" also checks whether actual training since
the current plan was generated has drifted meaningfully from what the
plan called for. `lib/trainingPlanDeviation.js` buckets the activities
imported since the plan's `generated_at` into calendar weeks counted
from that start date, and `/api/training-plan/deviation` hands those —
plus the plan's own phases (guidance text, not rigid per-week numbers)
and the athlete's training-load/biomechanics signals — to a dedicated
Claude call, `generateTrainingPlanDeviation` in `lib/anthropic.js`.
Unlike the injury and training-plan features, there's no strict formula
for "10% off plan": the plan itself is expressed as guidance ranges, not
fixed numeric weekly targets, so the model makes that judgment call
directly, the same way it already judges risk level or training
adjustments elsewhere in the app. It returns which of distance, pace,
power, heart rate, or fatigue look off by roughly 10% or more and in
which direction, a week-by-week status ("on track" / "missed" /
"exceeded" / "insufficient data") matched back to the plan's own phase
names, and a likelihood assessment of whether the drift, if it
continues, would actually threaten the event goal.

A significant deviation surfaces as an alert panel at the top of the
dashboard with three choices: **regenerate** the plan from scratch,
**adjust** the existing plan's upcoming phases around the deviation
(`generateAdjustedTrainingPlan`, both sharing `generateTrainingPlan`'s
output schema so either result caches and renders exactly like a normal
plan), or **continue** with the current plan as-is. Choosing "continue"
doesn't change the plan; it marks the deviation `acknowledged`
(`training_plan_deviations` table), and the Training Plan page then
annotates each affected phase with the specific weeks that were off and
by how much, plus the persisted goal-impact analysis. This check shares
the training-plan feature's own tier-based rate limit (`ai_usage`,
feature `training_plan`) rather than getting a limit of its own —
regenerating, adjusting, and the deviation check itself all draw from
the same budget, consistent with how an auto-triggered plan
regeneration already spends from it today; when the tier isn't eligible,
the background check just silently skips rather than showing a locked
state (it isn't a user-clicked action). A new plan — regenerated,
adjusted, or simply because the goal changed — always clears any prior
deviation record, since there's nothing meaningful left to compare
against once the plan itself has changed.

## Membership tiers, display font size, and billing

### Free / Plus / Pro

Every account starts on **Free**. The three tiers (`lib/membership.js`)
don't gate *access* to a feature — they gate how often the two AI
features (the injury/recovery/nutrition panel, the training plan) are
allowed to actually call Claude, since that's the real cost driver in
this app:

| Tier | Price | AI refresh cadence |
|---|---|---|
| Free | $0 | once every 90 days |
| Plus | $1.99/mo or $19.99/yr | once every 30 days |
| Pro | $2.99/mo or $29.99/yr | unlimited |

This is enforced server-side in `/api/insights` and `/api/training-plan`,
not just displayed — see `lib/membership.js`'s `isRefreshEligible` /
`nextEligibleDate`, backed by a new `ai_usage` table that records the
last time each feature *actually generated* for a user, independent of
whatever's currently cached. That last part matters: changing a
training-plan goal deliberately does **not** delete the previous cached
plan or reset the refresh clock (see the comment in `saveRaceGoal`,
`lib/db.js`) — otherwise a free-tier user could bypass the 90-day limit
just by re-entering their event. When the tier isn't eligible to
regenerate and the cached plan is for a *different* goal than the
current one, the API returns `plan: null` rather than showing a plan for
the wrong race — `app/training-plan/page.js` and the dashboard's injury
panel both surface a "locked" message with the next eligible date and an
upgrade link when this happens.

A user's tier is only ever the source of truth via
`resolveEffectiveTier()` (`lib/membership.js`), never `user.tier`
directly — a stored tier can be *lapsed* (a subscription period ended, a
promo expired) without anything having written "free" back to the row
yet, and that function is where expiry actually gets resolved, on every
read. There's no cron job downgrading accounts; a `tier_expires_at` in
the past just stops counting starting from the next request.

### Display font size

A +/-/reset control lives in the dashboard's hamburger menu
(`components/UserMenu.js`) and writes a `--fs-scale` CSS custom property
(`lib/fontSize.js` for the shared bounds/storage key), which every
`font-size` declaration in `globals.css` is expressed as a `calc()`
multiple of. Like the theme, it's applied before first paint by the
inline script in `app/layout.js` (reading the same `localStorage` key) to
avoid a resize flash, and persists per-browser, not per-account.

### Stripe billing

Upgrading (`/api/billing/checkout`) creates a Stripe Checkout Session
with the price built **inline** via `price_data` rather than a
pre-created Stripe Price object — `lib/pricing.js` is the only file that
needs editing to change what athletes pay; nothing needs to stay in sync
on the Stripe dashboard side. `allow_promotion_codes: true` is set on
every session, so creating a seasonal discount is a Stripe-dashboard-only
action (Coupons → create one, optionally scoped to a Promotion Code) —
no code change needed. A "Manage billing" link
(`/api/billing/portal`) opens Stripe's hosted Customer Portal for
updating a payment method, viewing invoices, or canceling; deliberately
*not* used for plan switching, since the portal's self-serve plan
switcher needs pre-created Prices in a product catalog, which would
conflict with pricing living entirely in code. Upgrades, renewals, and
plan changes all go back through a fresh Checkout session instead — the
account page's "Subscribe" buttons work for all three.

`/api/stripe/webhook` verifies the signature (`STRIPE_WEBHOOK_SECRET`)
and handles three event types: `checkout.session.completed` (grants the
tier and sets `tier_expires_at` to the new subscription's period end),
`invoice.payment_succeeded` (extends `tier_expires_at` on automatic
recurring renewals — skipped for the invoice tied to the *initial*
checkout, which the first event already handled), and
`customer.subscription.deleted` (just detaches the dead subscription id;
doesn't force an immediate downgrade, since `tier_expires_at` already
reflects the paid-through date and `resolveEffectiveTier` naturally
treats it as lapsed once that date passes). One thing worth knowing if
you're extending this: recent Stripe API versions moved
`current_period_end` off the top-level Subscription object onto each
subscription item (`subscription.items.data[0].current_period_end`), and
moved `invoice.subscription` to
`invoice.parent.subscription_details.subscription` — both are easy to
get wrong from memory/older examples, and the installed `stripe` npm
package's own type definitions are the fastest way to check current
field names before changing this code.

**None of this has been tested against a real Stripe account** — there's
no live key in this environment. The integration is written correctly
against the installed SDK version's actual types (verified line by line,
not from memory), but before going live: set `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` (from the Stripe dashboard's Developers →
Webhooks, pointed at `/api/stripe/webhook`, subscribed to at least
`checkout.session.completed`, `invoice.payment_succeeded`, and
`customer.subscription.deleted`), and run an actual test-mode checkout
end to end before trusting it with real cards.

### Beta Pro trial

New signups (both password and Google) are granted **Pro tier free for
`BETA_PRO_TRIAL_DAYS` days** (`lib/membership.js`, currently 90) via the
same `tier`/`tier_expires_at` mechanism as a paid subscription — there's
no separate "trial" concept. Set that constant to `0` to turn the promo
off for new signups; accounts already granted a trial keep whatever
`tier_expires_at` they got, since expiry is resolved per-account, not
globally. The home page's pricing section reads this same constant to
show (or hide) the beta banner, so turning it off there is automatic too.

## What's still simple on purpose (MVP tradeoffs)

- **No webhook / auto-import.** Someone has to click Import (or
  Re-sync). Strava's push-subscription API would close that gap.
- **No self-service password reset** (see above) — signup/login/email
  verification/Google sign-in are all there, but a locked-out user with
  no working password currently has no recovery flow of their own.
- **Stripe billing is untested against a live account.** The checkout,
  portal, and webhook code is complete and was checked against the
  installed `stripe` SDK's own type definitions (catching two real
  field-name changes along the way — see the billing section above),
  but no test-mode Stripe keys were available in this environment, so
  none of it has been exercised against Stripe's actual API. Run a
  real test-mode checkout before trusting it with payments.
- **No proration on plan switches.** Each "Subscribe" click starts a
  fresh Checkout Session; Stripe treats it as a new subscription
  rather than modifying/prorating an existing one in place. A user
  switching Plus → Pro (or monthly → yearly) ends up with two
  subscriptions unless the old one is cancelled first via the billing
  portal.
- **No dunning / `past_due` handling.** The webhook only reacts to
  `checkout.session.completed`, `invoice.payment_succeeded`, and
  `customer.subscription.deleted` — a failed renewal charge doesn't
  currently downgrade the user or prompt them to update their card
  until the subscription is fully cancelled.
- **Gear data only populates on (re-)import.** Activities imported
  before the Equipment Lifecycle feature shipped won't show gear until
  the athlete hits Re-sync, which re-fetches each activity's detail
  (including `gear_id`) from Strava.
- **Decoupling/cadence-drift need real streams to say anything.** Short
  or interval activities, or ones missing heart-rate plus pace/power/
  cadence data, simply don't produce a reading for that activity — the
  panel says so rather than guessing from insufficient data.
- **The grade-adjustment factor behind the race-day plan is coarse.**
  It's derived from whole-activity average pace/elevation, not
  per-kilometer splits (none are stored), so it's a directional
  comparison of the athlete's own hilly vs. flat runs, not a precise
  grade-adjusted-pace model.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in all five values
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

For local Strava OAuth testing, set the app's Authorization Callback
Domain to `localhost` (Strava allows this).
