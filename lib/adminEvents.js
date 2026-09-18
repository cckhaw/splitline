// Human-readable labels for usage_events.event_type — shared between the
// admin API routes (not strictly needed there) and the admin pages
// (client components), so the mapping only lives in one place.
export const EVENT_LABELS = {
  login: "Logins",
  strava_sync: "Strava re-syncs",
  ai_refresh_biomechanical: "Biomechanical Shield AI refreshes",
  training_plan_generate: "Training plan generations",
  race_day_plan_generate: "Race-day plan generations",
  export_share: "Exports (Share / Save as image / Post to Strava)",
};

export function eventLabel(type) {
  return EVENT_LABELS[type] || type;
}
