// Human-readable labels for usage_events.event_type — shared between the
// admin API routes (not strictly needed there) and the admin pages
// (client components), so the mapping only lives in one place.
export const EVENT_LABELS = {
  login: "Logins",
  strava_sync: "Strava re-syncs",
  ai_refresh_biomechanical: "Overtraining Shield AI analyses",
  training_plan_generate: "Training plan generations",
  race_day_plan_generate: "Race Day Plan generations",
  export_share: "Exports (Share / Save as image / Post to Strava)",
  training_plan_deviation_check: "Training plan deviation checks",
  training_plan_deviation_continue: "Deviation: continued with existing plan",
  training_plan_deviation_regenerate: "Deviation: plan regenerated",
  training_plan_deviation_adjust: "Deviation: plan adjusted",
  race_day_course_upload: "Race Day Plan course uploads",
  oura_sync: "Oura Ring data syncs",
};

export function eventLabel(type) {
  return EVENT_LABELS[type] || type;
}
