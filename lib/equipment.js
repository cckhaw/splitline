// Deterministic wear-percentage physics for running shoes and bike
// drivetrains — the "AI/LLM Layer: evaluates foam compression cycles" and
// chain-wear check from the Equipment Lifecycle & Telemetry Engine spec is,
// underneath, a formula over known thresholds rather than something that
// benefits from a language model, so this stays rule-based (no Claude
// call, no AI-tier gating) and just writes clear, specific copy from the
// numbers it computes.

// Common rule-of-thumb midsole lifespan before cushioning/foam degradation
// meaningfully raises injury risk — sources vary roughly 500-800km;
// 700km is the mid-point used here as the reference-weight baseline.
const SHOE_BASE_LIFESPAN_KM = 700;
const REFERENCE_WEIGHT_KG = 70;
// Heavier footstrike compresses foam faster — a soft, deliberately modest
// scaling (not a biomechanics lab result): -3% lifespan per kg above the
// reference weight, floored so it never claims less than 65% of base.
const LIFESPAN_PCT_PER_KG_OVER = 0.03;
const MIN_LIFESPAN_FRACTION = 0.65;

// Typical drivetrain/chain replacement interval before wear starts
// costing efficiency and risking a mid-ride mechanical.
const BIKE_CHAIN_LIFESPAN_KM = 3000;

const WATCH_THRESHOLD_PCT = 85; // matches the 85%-of-lifespan spec
const REPLACE_THRESHOLD_PCT = 100;

export function shoeLifespanKm(weightKg) {
  if (!weightKg || weightKg <= REFERENCE_WEIGHT_KG) return SHOE_BASE_LIFESPAN_KM;
  const overKg = weightKg - REFERENCE_WEIGHT_KG;
  const fraction = Math.max(MIN_LIFESPAN_FRACTION, 1 - overKg * LIFESPAN_PCT_PER_KG_OVER);
  return Math.round(SHOE_BASE_LIFESPAN_KM * fraction);
}

function statusFor(percentUsed) {
  if (percentUsed >= REPLACE_THRESHOLD_PCT) return "replace";
  if (percentUsed >= WATCH_THRESHOLD_PCT) return "watch";
  return "healthy";
}

function recommendationFor(item) {
  const label = item.name || (item.gearType === "bike" ? "This bike's drivetrain" : "These shoes");
  if (item.status === "replace") {
    return item.gearType === "bike"
      ? `${label} is past its typical chain-wear mileage (${item.distanceKm}/${item.thresholdKm}km) — a worn chain accelerates cassette/chainring wear and raises mid-ride mechanical risk. Replace the chain soon.`
      : `${label} has passed its estimated midsole lifespan (${item.distanceKm}/${item.thresholdKm}km) — compressed foam no longer absorbs impact the way it did new, which raises injury risk. Time to retire them.`;
  }
  if (item.status === "watch") {
    return item.gearType === "bike"
      ? `${label} is at ${item.percentUsed}% of its typical chain-wear mileage — worth checking chain stretch with a wear gauge and planning a replacement soon.`
      : `${label} is at ${item.percentUsed}% of its estimated lifespan — still usable, but a good time to rotate in a fresh pair for your longest/hardest efforts.`;
  }
  return item.gearType === "bike"
    ? `${label} has healthy drivetrain mileage left (${item.percentUsed}% of typical chain-wear range).`
    : `${label} has healthy mileage left (${item.percentUsed}% of estimated lifespan).`;
}

// `weightKg` is the athlete's self-reported body weight (lib/db.js's
// users.weight_kg) — optional; falls back to the unscaled baseline.
export function evaluateGear(gearRow, weightKg) {
  const thresholdKm = gearRow.gearType === "bike" ? BIKE_CHAIN_LIFESPAN_KM : shoeLifespanKm(weightKg);
  const distanceKm = Math.round(gearRow.distanceKm || 0);
  const percentUsed = thresholdKm > 0 ? Math.round((distanceKm / thresholdKm) * 100) : 0;
  const status = statusFor(percentUsed);
  const item = {
    id: gearRow.id,
    gearType: gearRow.gearType,
    name: gearRow.name,
    brandName: gearRow.brandName,
    modelName: gearRow.modelName,
    distanceKm,
    thresholdKm,
    percentUsed: Math.min(percentUsed, 999),
    status,
  };
  item.recommendation = recommendationFor(item);
  return item;
}

export function evaluateAllGear(gearRows, weightKg) {
  return gearRows
    .map((g) => evaluateGear(g, weightKg))
    .sort((a, b) => b.percentUsed - a.percentUsed);
}

// An informational shopping search — never an actual purchase or
// affiliate transaction. See README for why: automating a real order is
// exactly the kind of irreversible action this app deliberately doesn't take.
export function shopSearchUrl(item) {
  const q = [item.brandName, item.modelName || item.name].filter(Boolean).join(" ") || (item.gearType === "bike" ? "bike chain" : "running shoes");
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}
