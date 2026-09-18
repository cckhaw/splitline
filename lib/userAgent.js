// Lightweight heuristic User-Agent classifier for the admin module's
// device/browser breakdown — not a full UA database, just the handful of
// signals that separate the browsers/devices actually seen in the wild.
// Order matters: several browsers' UAs contain other browsers' tokens
// (Edge and Chrome both contain "Chrome/", Chrome on iOS uses "CriOS/",
// etc.), so more specific checks run first.

export function parseUserAgent(ua) {
  const s = String(ua || "");
  return { browser: detectBrowser(s), deviceType: detectDeviceType(s) };
}

function detectBrowser(s) {
  if (!s) return "Other";
  if (/Edg\//.test(s)) return "Edge";
  if (/SamsungBrowser\//.test(s)) return "Samsung Internet";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/Firefox\/|FxiOS\//.test(s)) return "Firefox";
  if (/CriOS\/|Chrome\//.test(s)) return "Chrome";
  if (/Version\/.*Safari\//.test(s)) return "Safari";
  return "Other";
}

function detectDeviceType(s) {
  if (!s) return "desktop";
  if (/iPad|(Android(?!.*Mobile))|Tablet|PlayBook|Kindle/.test(s)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/.test(s)) return "mobile";
  return "desktop";
}
