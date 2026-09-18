-- Run this once against your Postgres database (Vercel Postgres, Neon,
-- Supabase, or any plain Postgres all work — this file uses nothing
-- Vercel-specific). See README.md, "Provision a database".

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,             -- NULL for accounts created via Google sign-in
  name TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  google_id TEXT UNIQUE,
  birth_date DATE,                -- self-reported; Strava's API does not expose date of birth
  tier TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'plus' | 'pro' — see lib/membership.js
  tier_expires_at TIMESTAMPTZ,         -- NULL for free; current paid/promo period end otherwise
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrations for databases created before these columns existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
-- Self-reported, optional; used only to scale the shoe-wear estimate in
-- lib/equipment.js (heavier impact compresses midsole foam faster) — same
-- reasoning as birth_date above: Strava's API doesn't expose body weight.
ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_kg DOUBLE PRECISION;
-- Profile photo: either a hotlinked Strava CDN URL (avatar_source='strava',
-- refreshed on each import) or a data: URI the athlete cropped and uploaded
-- themselves (avatar_source='upload') — once they upload their own, imports
-- stop overwriting it. TEXT has no practical length limit in Postgres, so a
-- modest cropped JPEG data URI fits fine without needing object storage.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source TEXT;

-- Six-digit codes emailed for signup verification, email-change
-- confirmation, and password-reset verification. Codes are stored
-- hashed (sha256), never in plaintext.
CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,       -- 'signup_email' | 'change_email' | 'password_reset'
  code_hash TEXT NOT NULL,
  new_email TEXT,              -- target address for 'change_email'; NULL otherwise
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes (user_id, purpose, created_at DESC);

-- Records the last time each AI feature actually generated (as opposed
-- to serving a cached result) — the basis for tier-based rate limiting
-- in lib/membership.js. Deliberately separate from ai_insights'/
-- training_plans' own timestamps: those describe what's cached and get
-- reused across different goals/inputs, while this one thing must
-- reflect real spend regardless of whether the cache was invalidated in
-- between (e.g. changing a training-plan goal must not reset the clock).
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,   -- 'injury' | 'training_plan'
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);

-- Cached AI-generated injury-risk / recovery / nutrition analysis, keyed
-- by a hash of the inputs so the LLM is only called again when the
-- athlete's recent activities (or profile) actually change.
CREATE TABLE IF NOT EXISTS ai_insights (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user's current upcoming-event goal. One row per user: setting a new
-- event replaces the old one (and the cached plan below along with it).
CREATE TABLE IF NOT EXISTS race_goals (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,      -- 'running' | 'duathlon' | 'triathlon'
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  target_distance TEXT NOT NULL, -- one of lib/eventTypes.js's DISTANCE_OPTIONS for event_type
  goal_time TEXT,                -- one of lib/eventTypes.js's GOAL_TIME_OPTIONS for target_distance
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE race_goals ADD COLUMN IF NOT EXISTS goal_time TEXT;

-- Cached AI-generated progressive training plan for the current goal
-- above, keyed by a hash of the inputs (goal + activity summary) so the
-- LLM is only called again when either actually changes.
CREATE TABLE IF NOT EXISTS training_plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cached AI-generated race-day pacing/fueling plan for the current goal
-- (race_goals above) plus this feature's own race-day inputs (expected
-- temperature/humidity, course elevation gain) — keyed by a hash of all
-- three plus the activity summary, same anti-gaming approach as
-- training_plans: regenerating only actually happens when something changed.
CREATE TABLE IF NOT EXISTS race_day_plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  race_day_inputs JSONB NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strava_connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  strava_athlete_id BIGINT,
  access_token TEXT NOT NULL,   -- encrypted at rest, see lib/crypto.js
  refresh_token TEXT NOT NULL,  -- encrypted at rest
  expires_at BIGINT NOT NULL,
  own_client_id TEXT,           -- NULL = use the platform's shared Strava app
  own_client_secret TEXT,       -- encrypted at rest; NULL unless "bring your own app"
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_activity_id BIGINT NOT NULL,
  name TEXT,
  sport TEXT,
  start_date TIMESTAMPTZ,
  distance_km DOUBLE PRECISION,
  moving_min DOUBLE PRECISION,
  elevation_gain_m DOUBLE PRECISION,
  avg_hr DOUBLE PRECISION,
  avg_watts DOUBLE PRECISION,
  avg_speed_kmh DOUBLE PRECISION,
  calories DOUBLE PRECISION,
  trace JSONB,
  gear_id TEXT,                 -- Strava gear id (shoe/bike) used on this activity, if any
  avg_temp_c DOUBLE PRECISION,   -- device-recorded temperature (Strava's average_temp), NOT weather-API data — absent for most activities
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, strava_activity_id)
);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS gear_id TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS avg_temp_c DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities (user_id, start_date DESC);

-- Cached from Strava's /gear/{id} endpoint during import — distance_km is
-- Strava's own lifetime total for that piece of gear (not bounded by
-- whatever's in `activities`), which is what the wear-percentage estimate
-- in lib/equipment.js needs.
CREATE TABLE IF NOT EXISTS gear (
  id TEXT NOT NULL,             -- Strava gear id, e.g. "g12345" (shoe) or "b12345" (bike)
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gear_type TEXT NOT NULL,      -- 'shoe' | 'bike'
  name TEXT,
  brand_name TEXT,
  model_name TEXT,
  distance_km DOUBLE PRECISION,
  retired BOOLEAN NOT NULL DEFAULT false, -- athlete marked it retired on Strava
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE gear ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT false;

-- Every trackable user action, for the admin module's per-user usage
-- analysis (re-syncs, AI refreshes, plan generations, exports) and
-- site-wide device/browser split. browser/device_type are derived from
-- the request's User-Agent header at log time (see lib/userAgent.js) —
-- stored rather than re-parsed on read so admin queries stay cheap.
CREATE TABLE IF NOT EXISTS usage_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,     -- 'login' | 'strava_sync' | 'ai_refresh_biomechanical' |
                                 -- 'training_plan_generate' | 'race_day_plan_generate' | 'export_share'
  metadata JSONB,                -- event-specific extra detail, e.g. {"trigger":"resync"} or {"source":"share_pdf","panel":"training_plan"}
  browser TEXT,                  -- 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Samsung Internet' | 'Opera' | 'Other' | null
  device_type TEXT,              -- 'mobile' | 'tablet' | 'desktop' | null
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events (event_type, created_at DESC);
