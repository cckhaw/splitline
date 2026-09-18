"use client";

import { useEffect, useRef, useState } from "react";
import ShareIcon from "@/components/ShareIcon";

// Used on the Biomechanical panel, Training Plan, and Race-day Plan pages.
// `payload` is whatever that panel already has in state (insights, or
// goal+plan) — see lib/shareContent.js for the exact shape each `kind`
// expects. Posts to /api/share, which renders a branded PDF or PNG server
// side and streams it back for download.
export default function ShareButton({ kind, payload, label = "Share" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // "pdf" | "png" | null
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function download(format) {
    if (busy) return;
    setBusy(format);
    setError("");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, format, payload }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `splitline-share.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      setError("Couldn't generate that file — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="share-button" ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        style={{ width: "auto", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
        onClick={() => setOpen((o) => !o)}
      >
        <ShareIcon /> {label}
      </button>
      {open && (
        <div className="share-menu">
          <div className="share-menu-item" onClick={() => download("pdf")} style={busy ? { opacity: 0.6, cursor: "default" } : undefined}>
            {busy === "pdf" ? "Generating PDF…" : "Download as PDF"}
          </div>
          <div className="share-menu-item" onClick={() => download("png")} style={busy ? { opacity: 0.6, cursor: "default" } : undefined}>
            {busy === "png" ? "Generating PNG…" : "Download as PNG"}
          </div>
          {error && <div className="share-menu-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
