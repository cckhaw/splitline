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

  async function saveCard(activityId, name) {
    setSavingId(activityId);
    try {
      const res = await fetch("/api/overlay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity_id: activityId, theme, units, format: "png" }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `splitline-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setSavingId(null);
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
                  <button
                    style={{ width: "auto", padding: "6px 12px" }}
                    onClick={() => saveCard(a.id, a.name)}
                    disabled={savingId === a.id}
                  >
                    {savingId === a.id ? "Saving…" : "Save as image"}
                  </button>
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
