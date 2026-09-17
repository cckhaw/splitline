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

-- Six-digit codes emailed for signup verification and email-change
-- confirmation. Codes are stored hashed (sha256), never in plaintext.
CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,       -- 'signup_email' | 'change_email'
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
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, strava_activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities (user_id, start_date DESC);
