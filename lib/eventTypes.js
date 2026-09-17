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
