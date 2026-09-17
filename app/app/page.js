"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ERROR_MESSAGES = {
  state_mismatch: "That connection attempt looked tampered with — try connecting again.",
  token_exchange_failed: "Strava didn't accept that connection — check your app's credentials and try again.",
  access_denied: "Strava access wasn't granted, so there's nothing to import yet.",
};

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

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState(null); // null = loading
  const [status, setStatus] = useState("");
  const [statusWarn, setStatusWarn] = useState(false);

  const [ownApp, setOwnApp] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const [activities, setActivities] = useState([]);
  const [previews, setPreviews] = useState({});
  const [insights, setInsights] = useState(null);
  const [refreshingAi, setRefreshingAi] = useState(false);

  const [theme, setTheme] = useState("ink");
  const [units, setUnits] = useState("metric");

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (!data.authenticated) {
      router.push("/login");
      return null;
    }
    setMe(data);
    return data;
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("strava_error");
    if (err) {
      setStatusWarn(true);
      setStatus(ERROR_MESSAGES[err] || `Couldn't connect to Strava (${err}).`);
      window.history.replaceState({}, "", "/app");
    }
    loadMe().then((data) => {
      if (data?.stravaConnected && data.activityCount > 0) loadActivitiesAndInsights();
    });
  }, [loadMe]);

  async function handleConnect(e) {
    e.preventDefault();
    setConnecting(true);
    setStatusWarn(false);
    setStatus("");
    try {
      const body = ownApp ? { clientId, clientSecret } : {};
      const res = await fetch("/api/strava/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't start the Strava connection.");
      window.location.href = data.authorizeUrl;
    } catch (e) {
      setStatusWarn(true);
      setStatus(e.message);
      setConnecting(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setImportProgress(0);
    setStatusWarn(false);
    let page = 1;
    let done = false;
    let total = 0;
    try {
      while (!done && page <= 6) {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ page }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Import failed partway through.");
        total = data.total;
        done = data.done;
        setImportProgress(Math.min(total, 30));
        page = data.nextPage;
      }
      setStatus(`Imported ${total} activities.`);
      await loadActivitiesAndInsights();
    } catch (e) {
      setStatusWarn(true);
      setStatus(e.message);
    } finally {
      setImporting(false);
    }
  }

  async function loadActivitiesAndInsights() {
    const [actRes, insRes] = await Promise.all([fetch("/api/activities"), fetch("/api/insights")]);
    const actData = await actRes.json();
    const insData = await insRes.json();
    setActivities(actData.activities || []);
    setInsights(insData);
    await loadPreviews(actData.activities || [], theme, units);
  }

  async function refreshAiInsights() {
    setRefreshingAi(true);
    try {
      const res = await fetch("/api/insights?refresh=1");
      const data = await res.json();
      setInsights(data);
    } finally {
      setRefreshingAi(false);
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

  async function savePng(activityId, name) {
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
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <header className="top">
        <div className="wordmark">SPLIT<span>LINE</span></div>
        <nav className="navlinks">
          <span className="tagline">{me.name || me.email}</span>
          <Link href="/account">My account</Link>
          <button style={{ width: "auto", padding: "7px 14px" }} onClick={handleLogout}>Log out</button>
        </nav>
      </header>

      {status && <div className={`status-line${statusWarn ? " warn" : ""}`} style={{ marginBottom: 16 }}>{status}</div>}

      {!me.stravaConnected && (
        <div className="panel">
          <h2>Connect Strava</h2>
          <button className="primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Strava"}
          </button>
          <div className="hint">
            Uses Splitline&rsquo;s shared Strava app — one click, no setup. Recommended for almost everyone.
          </div>

          <div className="advanced-toggle" onClick={() => setOwnApp(!ownApp)}>
            {ownApp ? "▾" : "▸"} Advanced: use my own Strava API app
          </div>
          {ownApp && (
            <form onSubmit={handleConnect} className="advanced-form">
              <div className="hint">
                Only worth doing if you&rsquo;re hitting Strava&rsquo;s rate limits under the shared app, or want
                your imports fully isolated. Register one at{" "}
                <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a>.
              </div>
              <label>Client ID</label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
              <label>Client secret</label>
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
              <button className="primary" type="submit" disabled={connecting} style={{ marginTop: 12 }}>
                {connecting ? "Connecting…" : "Connect with my app"}
              </button>
            </form>
          )}
        </div>
      )}

      {me.stravaConnected && activities.length === 0 && !importing && (
        <div className="panel">
          <h2>Import your activities</h2>
          <button className="primary" onClick={runImport}>Import last 30 activities</button>
        </div>
      )}

      {importing && (
        <div className="panel">
          <h2>Importing…</h2>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(importProgress / 30) * 100}%` }} /></div>
          <div className="hint">{importProgress} of up to 30 activities</div>
        </div>
      )}

      {insights && activities.length > 0 && (
        <div className="panel insights">
          <h2>Training load</h2>
          {insights.load.acwr != null ? (
            <>
              <div className="load-number">{insights.load.acwr}</div>
              <div className="load-status">{insights.load.status}</div>
            </>
          ) : (
            <div className="hint">{insights.load.status}</div>
          )}
          {insights.load.note && <div className="hint">{insights.load.note}</div>}

          {insights.pace && (
            <>
              <h2 style={{ marginTop: 20 }}>Race pace projection</h2>
              <div className="pace-grid">
                {insights.pace.predictions.map((p) => (
                  <div key={p.label} className="pace-cell">
                    <div className="hint">{p.label}</div>
                    <div className="pace-time">{formatDuration(p.seconds)}</div>
                  </div>
                ))}
              </div>
              <div className="hint">
                From your {insights.pace.referenceActivity.distanceKm}km effort — {insights.pace.note}
              </div>
            </>
          )}
        </div>
      )}

      {insights && activities.length > 0 && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Injury risk, recovery &amp; nutrition</h2>
            <button
              style={{ width: "auto", padding: "6px 12px" }}
              onClick={refreshAiInsights}
              disabled={refreshingAi}
            >
              {refreshingAi ? "Analyzing…" : "Refresh AI analysis"}
            </button>
          </div>

          {insights.ageSource === "unavailable" && (
            <div className="hint" style={{ marginTop: 10 }}>
              Strava doesn&rsquo;t share date of birth, so this estimate doesn&rsquo;t know your age yet.{" "}
              <a href="/account">Add your date of birth</a> in My account for a sharper read.
            </div>
          )}

          {insights.ai ? (
            <>
              <div className={`risk-badge risk-${insights.ai.risk_level}`} style={{ marginTop: 14 }}>
                {insights.ai.risk_level} risk · {insights.ai.risk_score}/100
              </div>
              <div className="hint" style={{ color: "var(--ink)", marginTop: 8 }}>{insights.ai.risk_summary}</div>

              <div className="ai-columns">
                <div>
                  <h3>Risk factors</h3>
                  <ul>{insights.ai.risk_factors.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <h3>Recovery plan</h3>
                  <ul>{insights.ai.recovery_plan.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <h3>Nutrition plan</h3>
                  <ul>{insights.ai.nutrition_plan.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              </div>
              <div className="hint" style={{ marginTop: 12 }}>
                {insights.aiStale ? "Showing the last successful analysis — the latest refresh failed. " : ""}
                Generated by an AI model from your recent training patterns — a wellness heuristic, not medical advice.
              </div>
            </>
          ) : (
            <div className="hint" style={{ marginTop: 10 }}>
              {insights.aiError
                ? `Couldn't generate an AI analysis right now (${insights.aiError}).`
                : "No AI analysis yet."}
            </div>
          )}
        </div>
      )}

      {activities.length > 0 && (
        <>
          <div className="panel">
            <div className="toggle-group" style={{ marginBottom: 10 }}>
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
              <div style={{ flex: 1 }} />
              <button style={{ width: "auto", padding: "7px 14px" }} onClick={runImport} disabled={importing}>
                Re-sync
              </button>
            </div>
          </div>

          <div className="gallery">
            {activities.map((a) => (
              <div key={a.id} className="gallery-card">
                {previews[a.id] ? <img src={previews[a.id]} alt={a.name} /> : <div className="status-line">Rendering…</div>}
                <div className="gallery-card-footer">
                  <span>{a.name}</span>
                  <button style={{ width: "auto", padding: "6px 12px" }} onClick={() => savePng(a.id, a.name)}>
                    Save PNG
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
