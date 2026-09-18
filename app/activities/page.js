"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import SiteFooter from "@/components/SiteFooter";

// Bounded parallelism for rendering up to 30 SVG previews at once — plenty
// of throughput without hammering the server with 30 simultaneous requests.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// The per-activity twin of the dashboard's Strava Summary panel: one
// cockpit-readout card per imported activity (lib/svg.js's real renderer,
// same one /api/mcp serves), rather than the single aggregate infographic.
export default function ActivitiesPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [activities, setActivities] = useState([]);
  const [previews, setPreviews] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [postingId, setPostingId] = useState(null);
  const [postHint, setPostHint] = useState(null); // { id, text }
  const [theme, setTheme] = useState("ink");
  const [units, setUnits] = useState("metric");

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(async (data) => {
      if (!data.authenticated) { router.push("/login"); return; }
      setMe(data);
      const res = await fetch("/api/activities");
      const actData = await res.json();
      const list = actData.activities || [];
      setActivities(list);
      if (list.length) await loadPreviews(list, "ink", "metric");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadPreviews(list, themeArg, unitsArg) {
    const entries = await mapWithConcurrency(list, 4, async (a) => {
      const res = await fetch("/api/overlay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity_id: a.id, theme: themeArg, units: unitsArg, format: "svg" }),
      });
      if (!res.ok) return [a.id, null];
      const svgText = await res.text();
      return [a.id, URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }))];
    });
    setPreviews(Object.fromEntries(entries));
  }

  function changeTheme(next) {
    setTheme(next);
    loadPreviews(activities, next, units);
  }
  function changeUnits(next) {
    setUnits(next);
    loadPreviews(activities, theme, next);
  }

  function fileNameFor(name) {
    return `splitline-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`;
  }

  async function fetchCardBlob(activityId, intent) {
    const res = await fetch("/api/overlay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activity_id: activityId, theme, units, format: "png", intent }),
    });
    if (!res.ok) return null;
    return res.blob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function showPostHint(activityId, text) {
    setPostHint({ id: activityId, text });
    setTimeout(() => setPostHint((h) => (h?.id === activityId ? null : h)), 5000);
  }

  async function saveCard(activityId, name) {
    setSavingId(activityId);
    try {
      const blob = await fetchCardBlob(activityId, "save");
      if (!blob) return;
      downloadBlob(blob, fileNameFor(name));
    } finally {
      setSavingId(null);
    }
  }

  // Strava's public API has no endpoint for creating an image feed post on
  // a user's behalf, so this hands the rendered card to the OS-level share
  // sheet instead (Web Share API, level 2 — file sharing) — on a phone with
  // the Strava app installed, Strava shows up as a share target there, the
  // same way it does from a phone's own photo gallery. Where that's not
  // supported (most desktop browsers), it falls back to the same download
  // as "Save as image" with a hint to share it manually from the Strava app.
  async function postToStrava(activityId, name) {
    setPostingId(activityId);
    try {
      const blob = await fetchCardBlob(activityId, "post_strava");
      if (!blob) return;
      const filename = fileNameFor(name);
      const file = new File([blob], filename, { type: "image/png" });
      const shareData = { files: [file], title: name, text: `${name} — via Splitline` };
      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (e) {
          if (e.name !== "AbortError") downloadBlob(blob, filename);
        }
      } else {
        downloadBlob(blob, filename);
        showPostHint(activityId, "Your browser can't hand this image to Strava directly — downloaded instead. Open it from the Strava app to post.");
      }
    } finally {
      setPostingId(null);
    }
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <AppHeader name={me.name || me.email} tier={me.tier} isTrial={me.isTrial} avatarUrl={me.avatarUrl} />

      <h2 style={{ fontSize: "calc(20px * var(--fs-scale, 1))", color: "var(--ink)", marginBottom: 6 }}>Last 30 Activities</h2>
      <div className="hint" style={{ marginTop: 0, marginBottom: 18 }}>
        Every imported activity gets its own cockpit-readout card — pace, power, heart rate, and the trace itself,
        styled from that activity&rsquo;s own numbers. Save any one and post it straight to your Strava feed.
      </div>

      {activities.length === 0 ? (
        <div className="panel">
          <div className="hint" style={{ marginTop: 0 }}>
            No activities imported yet — head back to the <Link href="/app">Dashboard</Link> to connect Strava and import.
          </div>
        </div>
      ) : (
        <>
          <div className="toggle-group" style={{ marginBottom: 18 }}>
            {["ink", "paper", "signal"].map((k) => (
              <div key={k} className={`toggle${theme === k ? " active" : ""}`} onClick={() => changeTheme(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </div>
            ))}
            <div style={{ width: 16 }} />
            {["metric", "imperial"].map((k) => (
              <div key={k} className={`toggle${units === k ? " active" : ""}`} onClick={() => changeUnits(k)}>
                {k === "metric" ? "km · kg" : "mi · lb"}
              </div>
            ))}
          </div>

          <div className="gallery">
            {activities.map((a) => (
              <div key={a.id} className="gallery-card">
                {previews[a.id] ? (
                  <img src={previews[a.id]} alt={a.name} />
                ) : (
                  <div className="status-line" style={{ padding: 16, marginTop: 0 }}>Rendering…</div>
                )}
                <div className="gallery-card-footer">
                  <span>{a.name}</span>
                  <div className="gallery-card-actions">
                    <button onClick={() => saveCard(a.id, a.name)} disabled={savingId === a.id}>
                      {savingId === a.id ? "Saving…" : "Save as image"}
                    </button>
                    <button onClick={() => postToStrava(a.id, a.name)} disabled={postingId === a.id}>
                      {postingId === a.id ? "Preparing…" : "Post to my Strava feed"}
                    </button>
                  </div>
                  {postHint?.id === a.id && <div className="gallery-card-hint">{postHint.text}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SiteFooter />
    </div>
  );
}
