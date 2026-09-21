"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import SiteFooter from "@/components/SiteFooter";

// Bounded parallelism for rendering a page's SVG previews at once — plenty
// of throughput without hammering the server with several simultaneous requests.
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

const PAGE_SIZE = 6;

// The per-activity twin of the dashboard's Strava Summary panel: one
// cockpit-readout card per imported activity (lib/svg.js's real renderer,
// same one /api/mcp serves), rather than the single aggregate infographic.
// Paginated 6-at-a-time (a 3x2 grid) with an optional date range, since
// housekeeping now keeps up to 100 activities per account (see
// app/api/import/route.js) — too many to render as one long gallery.
export default function ActivitiesPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dateError, setDateError] = useState("");
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
      await loadPage(1, "", "", "ink", "metric");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadPage(pageArg, fromArg, toArg, themeArg, unitsArg) {
    if (toArg && fromArg && toArg < fromArg) {
      setDateError("The end date can't be before the start date.");
      return;
    }
    setDateError("");
    setLoadingPage(true);
    try {
      const params = new URLSearchParams({ page: String(pageArg) });
      if (fromArg) params.set("from", fromArg);
      if (toArg) params.set("to", toArg);
      const res = await fetch(`/api/activities/list?${params.toString()}`);
      const data = await res.json();
      const list = data.activities || [];
      setActivities(list);
      setTotal(data.total || 0);
      setPage(pageArg);
      setPreviews({});
      if (list.length) await loadPreviews(list, themeArg ?? theme, unitsArg ?? units);
    } finally {
      setLoadingPage(false);
    }
  }

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

  function applyDateFilter() {
    loadPage(1, fromDate, toDate, theme, units);
  }
  function clearDateFilter() {
    setFromDate("");
    setToDate("");
    setDateError("");
    loadPage(1, "", "", theme, units);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(fromDate || toDate);

  return (
    <div className="shell">
      <AppHeader
        name={me.name || me.email}
        tier={me.tier}
        isTrial={me.isTrial}
        avatarUrl={me.avatarUrl}
        stravaConnected={me.stravaConnected}
        ouraConnected={me.ouraConnected}
        onOuraChange={(connected) => setMe((m) => (m ? { ...m, ouraConnected: connected } : m))}
      />

      <h2 style={{ fontSize: "calc(20px * var(--fs-scale, 1))", color: "var(--ink)", marginBottom: 6 }}>Activities</h2>
      <div className="hint" style={{ marginTop: 0, marginBottom: 18 }}>
        Every imported activity gets its own cockpit-readout card — pace, power, heart rate, and the trace itself,
        styled from that activity&rsquo;s own numbers. Save any one and post it straight to your Strava feed.
      </div>

      {total === 0 && !filtered && !loadingPage ? (
        <div className="panel">
          <div className="hint" style={{ marginTop: 0 }}>
            No activities imported yet — head back to the <Link href="/app">Dashboard</Link> to connect Strava and import.
          </div>
        </div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 18 }}>
            <div className="activities-filter-row">
              <label className="activities-filter-field">
                <span>From</span>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} max={toDate || undefined} />
              </label>
              <label className="activities-filter-field">
                <span>To</span>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate || undefined} />
              </label>
              <button style={{ width: "auto", padding: "7px 14px" }} onClick={applyDateFilter}>Filter</button>
              {filtered && (
                <button style={{ width: "auto", padding: "7px 14px" }} onClick={clearDateFilter}>Clear</button>
              )}
            </div>
            {dateError && <div className="status-line warn" style={{ marginTop: 10 }}>{dateError}</div>}
          </div>

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

          {total === 0 ? (
            <div className="panel">
              <div className="hint" style={{ marginTop: 0 }}>No activities in that date range.</div>
            </div>
          ) : (
            <div className="gallery gallery-3x2">
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
          )}

          {total > 0 && (
            <div className="activities-pagination">
              <button
                style={{ width: "auto", padding: "7px 14px" }}
                onClick={() => loadPage(page - 1, fromDate, toDate)}
                disabled={page <= 1 || loadingPage}
              >
                ← Previous
              </button>
              <span className="hint" style={{ margin: 0 }}>
                Page {page} of {totalPages} · {total} activit{total === 1 ? "y" : "ies"}
              </span>
              <button
                style={{ width: "auto", padding: "7px 14px" }}
                onClick={() => loadPage(page + 1, fromDate, toDate)}
                disabled={page >= totalPages || loadingPage}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      <SiteFooter />
    </div>
  );
}
