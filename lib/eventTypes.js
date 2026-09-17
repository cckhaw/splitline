// Canonical event types and their distance options — shared by the
// training-plan page (the dropdown) and /api/event (server-side
// validation) so the two can't drift out of sync.

export const EVENT_TYPES = [
  { value: "running", label: "Running race" },
  { value: "duathlon", label: "Duathlon" },
  { value: "triathlon", label: "Triathlon" },
];

export const DISTANCE_OPTIONS = {
  running: ["5K", "10K", "Half Marathon (21K)", "Marathon (42K)", "Ultra (50K+)"],
  duathlon: ["Sprint: 5K run – 30K bike – 5K run", "Standard: 10K run – 60K bike – 10K run"],
  triathlon: ["Sprint", "Olympic Distance (OD)", "Half Ironman (70.3)", "Full Ironman (140.6)"],
};

const NO_GOAL = "No specific goal — just finish";

// Goal-finish-time bands, keyed by the exact distance string above —
// deliberately coarse bands rather than a raw duration picker, so the
// choice stays a quick single dropdown; still enough for the AI training
// plan to target a real pace rather than guessing one.
export const GOAL_TIME_OPTIONS = {
  "5K": ["Under 20:00", "20:00–25:00", "25:00–30:00", "30:00–35:00", "35:00+", NO_GOAL],
  "10K": ["Under 40:00", "40:00–50:00", "50:00–60:00", "60:00–70:00", "70:00+", NO_GOAL],
  "Half Marathon (21K)": ["Under 1:30", "1:30–1:45", "1:45–2:00", "2:00–2:15", "2:15–2:30", "2:30+", NO_GOAL],
  "Marathon (42K)": ["Under 3:00", "3:00–3:30", "3:30–4:00", "4:00–4:30", "4:30–5:00", "5:00+", NO_GOAL],
  "Ultra (50K+)": ["Under 5:00", "5:00–7:00", "7:00–10:00", "10:00+", NO_GOAL],
  "Sprint: 5K run – 30K bike – 5K run": ["Under 1:15", "1:15–1:30", "1:30–1:45", "1:45–2:00", "2:00+", NO_GOAL],
  "Standard: 10K run – 60K bike – 10K run": ["Under 2:30", "2:30–3:00", "3:00–3:30", "3:30+", NO_GOAL],
  "Sprint": ["Under 1:15", "1:15–1:30", "1:30–1:45", "1:45–2:00", "2:00+", NO_GOAL],
  "Olympic Distance (OD)": ["Under 2:15", "2:15–2:45", "2:45–3:15", "3:15+", NO_GOAL],
  "Half Ironman (70.3)": ["Under 4:30", "4:30–5:30", "5:30–6:30", "6:30+", NO_GOAL],
  "Full Ironman (140.6)": ["Under 10:00", "10:00–12:00", "12:00–14:00", "14:00+", NO_GOAL],
};

export const NO_SPECIFIC_GOAL_TIME = NO_GOAL;
