-- Run this once against your Postgres database (Vercel Postgres, Neon,
-- Supabase, or any plain Postgres all work — this file uses nothing
-- Vercel-specific). See README.md, "Provision a database".

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
