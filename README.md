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
| `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com) — powers the injury-risk/recovery/nutrition panel. Without it, that panel just shows "couldn't generate an AI analysis"; the rest of the app is unaffected. |

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

Signup collects full name, email, password, and password confirmation,
then emails a 6-digit code (via Resend — see env vars above) that has to
be entered before the account can log in. "Continue with Google" is
available on both the signup and login pages; a Google sign-in is
email-verified automatically (Google already confirmed it) and links to
an existing password-based account with the same email if one exists.

Logged-in users get a **My account** page (linked from the dashboard
header) to change their name, email (also re-verified by code, sent to
the *new* address), and password. There's still no self-service
"forgot password" flow — add one before a public launch if you don't
want support tickets over locked-out accounts.

## Injury-risk, recovery, and nutrition — and a real limitation on "age from Strava"

The dashboard's "Injury risk, recovery & nutrition" panel sends an
aggregated statistical summary of the athlete's last 30 imported
activities — weekly volume, rest-day frequency, training-load trend,
sport mix, recent vs. prior heart rate, age if known — to Claude
(`lib/anthropic.js`, requires `ANTHROPIC_API_KEY`), which returns a
structured risk level/score, specific risk factors, and a recovery and
nutrition plan grounded in those numbers. It's a wellness heuristic
written by an LLM, not a medical assessment, and the UI keeps that
disclaimer visible.

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
when the underlying activity summary actually changes, or when the
dashboard's "Refresh AI analysis" button is clicked — the model isn't
called on every page load.

## What's still simple on purpose (MVP tradeoffs)

- **PNG rendering uses system fonts as a fallback** — bundle the actual
  Space Grotesk / IBM Plex Mono `.ttf` files and pass them to
  `@resvg/resvg-js`'s `font.fontFiles` in `app/api/overlay/route.js` for
  pixel-exact match to the preview.
- **No webhook / auto-import.** Someone has to click Import (or
  Re-sync). Strava's push-subscription API would close that gap.
- **No self-service password reset** (see above) — signup/login/email
  verification/Google sign-in are all there, but a locked-out user with
  no working password currently has no recovery flow of their own.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in all five values
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

For local Strava OAuth testing, set the app's Authorization Callback
Domain to `localhost` (Strava allows this).
