"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise;
function loadScript() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Calls
// onToken(token) when solved (and onToken("") on expiry/error). Tokens
// are single-use: bump `resetKey` after every submit to get a fresh one.
export default function Turnstile({ onToken, resetKey = 0 }) {
  const ref = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then((ts) => {
        if (cancelled || !ref.current) return;
        if (widgetId.current != null) {
          ts.reset(widgetId.current);
        } else {
          widgetId.current = ts.render(ref.current, {
            sitekey: SITE_KEY,
            callback: (t) => onToken(t),
            "expired-callback": () => onToken(""),
            "error-callback": () => onToken(""),
          });
        }
      })
      .catch(() => onToken(""));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={ref} style={{ marginTop: 14 }} />;
}
