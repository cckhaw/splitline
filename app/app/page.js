"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import TelemetryPanel from "@/components/TelemetryPanel";
import SiteFooter from "@/components/SiteFooter";

const ERROR_MESSAGES = {
  state_mismatch: "That connection attempt looked tampered with — try connecting again.",
  token_exchange_failed: "Strava didn't accept that connection — check your app's credentials and try again.",
  access_denied: "Strava access wasn't granted, so there's nothing to import yet.",
};

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
  const [summaryData, setSummaryData] = useState(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [insights, setInsights] = useState(null);
  const [refreshingAi, setRefreshingAi] = useState(false);
  const [equipment, setEquipment] = useState(null);
  const [gearTab, setGearTab] = useState("shoe");

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
    // "Re-sync from Strava" in the hamburger menu links here from other
    // pages (it can only run the import directly when already on the
    // dashboard) — this picks that request back up once loaded.
    const wantsResync = params.get("resync") === "1";
    if (wantsResync) window.history.replaceState({}, "", "/app");
    loadMe().then((data) => {
      if (data?.stravaConnected && wantsResync) runImport();
      else if (data?.stravaConnected && data.activityCount > 0) loadActivitiesAndInsights();
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
    const [actRes, insRes, equipRes] = await Promise.all([
      fetch("/api/activities"),
      fetch("/api/insights"),
      fetch("/api/equipment"),
    ]);
    const actData = await actRes.json();
    const insData = await insRes.json();
    setActivities(actData.activities || []);
    setInsights(insData);
    setEquipment(equipRes.ok ? await equipRes.json() : null);
    if ((actData.activities || []).length > 0) await loadSummaryData();
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

  async function loadSummaryData() {
    const res = await fetch("/api/telemetry-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "json" }),
    });
    setSummaryData(res.ok ? (await res.json()).summary : null);
  }

  // Theme/units only change how the already-fetched summary is *displayed*
  // (components/TelemetryPanel.js applies both client-side), so switching
  // either is an instant re-render — no round trip needed.
  function changeTheme(next) {
    setTheme(next);
  }
  function changeUnits(next) {
    setUnits(next);
  }

  async function saveSummaryImage() {
    setSummarySaving(true);
    try {
      // Mobile and desktop browsers get differently-laid-out export images
      // (lib/telemetrySummarySvg.js's two variants) so the saved picture
      // reads as well as the live panel does on whichever device saved it.
      const variant = window.matchMedia("(max-width: 700px)").matches ? "mobile" : "desktop";
      const res = await fetch("/api/telemetry-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme, units, format: "png", variant }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "splitline-training-summary.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setSummarySaving(false);
    }
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  return (
    <div className="shell">
      <AppHeader name={me.name || me.email} tier={me.tier} isTrial={me.isTrial} avatarUrl={me.avatarUrl} onResync={runImport} resyncing={importing} />

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

      {activities.length > 0 && (
        <div className="dashboard-grid">
          <div className="dashboard-main">
            {insights && (
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
                    <h2 style={{ marginTop: 20 }}>Race Pace Prediction</h2>
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

            {insights && (
              <div className="panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <h2 style={{ margin: 0 }}>Biomechanical &amp; Overtraining Shield</h2>
                  <button
                    style={{ width: "auto", padding: "6px 12px" }}
                    onClick={refreshAiInsights}
                    disabled={refreshingAi || insights.aiLocked}
                    title={insights.aiLocked ? "Refresh limit reached for your tier" : undefined}
                  >
                    {refreshingAi ? "Analyzing…" : "Refresh AI analysis"}
                  </button>
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Physics-based signals computed from your own activity streams — aerobic decoupling, cadence drift,
                  and workload ramp — interpreted below into a risk read, recovery plan, and nutrition guidance.
                </div>

                {insights.biomechanics && (
                  <div className="pace-grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <div className="pace-cell">
                      <div className="hint">Acute:chronic load</div>
                      <div className="pace-time">{insights.load.acwr != null ? insights.load.acwr : "—"}</div>
                    </div>
                    <div className="pace-cell">
                      <div className="hint">Aerobic decoupling (30d)</div>
                      <div className="pace-time">
                        {insights.biomechanics.windows.last30Days.avgDecouplingPct != null
                          ? `${insights.biomechanics.windows.last30Days.avgDecouplingPct}%`
                          : "—"}
                      </div>
                    </div>
                    <div className="pace-cell">
                      <div className="hint">Cadence drift (30d)</div>
                      <div className="pace-time">
                        {insights.biomechanics.windows.last30Days.avgCadenceDriftPct != null
                          ? `${insights.biomechanics.windows.last30Days.avgCadenceDriftPct}%`
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}
                {insights.biomechanics && insights.biomechanics.windows.last30Days.readableActivities === 0 && (
                  <div className="hint" style={{ marginTop: 8 }}>
                    Decoupling and cadence drift need sustained efforts (18+ minutes) with heart-rate plus pace, power,
                    or cadence data — none of your recent activities have enough of that yet.
                  </div>
                )}

                {insights.ageSource === "unavailable" && (
                  <div className="hint" style={{ marginTop: 10 }}>
                    Strava doesn&rsquo;t share date of birth, so this estimate doesn&rsquo;t know your age yet.{" "}
                    <a href="/account">Add your date of birth</a> in My account for a sharper read.
                  </div>
                )}

                {insights.aiLocked && (
                  <div className="status-line warn" style={{ marginTop: 10 }}>
                    You&rsquo;ve used this tier&rsquo;s AI refresh for now
                    {insights.nextEligibleAt ? ` — next one available ${new Date(insights.nextEligibleAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}.{" "}
                    <a href="/account">Upgrade to Plus or Pro</a> for more frequent updates.
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

                    {insights.ai.training_adjustment && insights.ai.training_adjustment.length > 0 && (
                      <>
                        <h2 style={{ marginTop: 20 }}>Recommended training adjustment</h2>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "calc(13px * var(--fs-scale, 1))", lineHeight: 1.6 }}>
                          {insights.ai.training_adjustment.map((f, i) => <li key={i} style={{ marginBottom: 6 }}>{f}</li>)}
                        </ul>
                        <div className="hint" style={{ marginTop: 8 }}>
                          This doesn&rsquo;t change your saved plan automatically — head to{" "}
                          <a href="/training-plan">Training plan</a> to update it if you agree.
                        </div>
                      </>
                    )}

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

            <div className="panel">
              <h2 style={{ margin: 0 }}>Strava Summary</h2>
              <div className="hint" style={{ marginTop: 6, marginBottom: 12 }}>
                One infographic for your last {activities.length} activities — total training time across the
                period, a fatigue read on how recently and how hard you've been training, and an intensity trend
                across the period. Weather/humidity aren't shown — Strava only occasionally records a device
                temperature, and there's no live weather source wired up.
                {" "}<Link href="/activities">See each activity&rsquo;s own card — Last 30 Activities →</Link>
              </div>
              <div className="toggle-group" style={{ marginBottom: 12 }}>
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
              {summaryData ? (
                <TelemetryPanel summary={summaryData} theme={theme} units={units} />
              ) : (
                <div className="status-line">Loading…</div>
              )}
              <button style={{ width: "auto", padding: "7px 14px", marginTop: 12 }} onClick={saveSummaryImage} disabled={summarySaving || !summaryData}>
                {summarySaving ? "Saving…" : "Save as image"}
              </button>
            </div>
          </div>

          <div className="dashboard-side">
            {equipment && equipment.items.length > 0 && (() => {
              const shoeItems = equipment.items.filter((i) => i.gearType !== "bike");
              const bikeItems = equipment.items.filter((i) => i.gearType === "bike");
              const shownItems = gearTab === "bike" ? bikeItems : shoeItems;
              return (
                <div className="panel">
                  <h2>Gears Check</h2>
                  <div className="hint" style={{ marginTop: 6, marginBottom: 4 }}>
                    Wear estimated from Strava&rsquo;s own gear mileage — shoe foam compression scaled to your body
                    weight if you&rsquo;ve added it, bike chain wear from typical drivetrain mileage.
                    {!equipment.weightOnFile && (
                      <> <a href="/account">Add your weight</a> for a sharper shoe estimate.</>
                    )}
                  </div>
                  <div className="equipment-tabs">
                    <button
                      type="button"
                      className={`equipment-tab${gearTab === "shoe" ? " active" : ""}`}
                      onClick={() => setGearTab("shoe")}
                    >
                      Shoes ({shoeItems.length})
                    </button>
                    <button
                      type="button"
                      className={`equipment-tab${gearTab === "bike" ? " active" : ""}`}
                      onClick={() => setGearTab("bike")}
                    >
                      Bikes ({bikeItems.length})
                    </button>
                  </div>
                  {shownItems.length === 0 ? (
                    <div className="hint" style={{ marginTop: 10 }}>
                      No {gearTab === "bike" ? "bikes" : "shoes"} retrieved from your Strava profile yet.
                    </div>
                  ) : (
                    <div className="equipment-list equipment-list-scroll">
                      {shownItems.map((item) => (
                        <div key={item.id} className="equipment-item">
                          <div className="equipment-item-head">
                            <span>{item.name || (item.gearType === "bike" ? "Bike" : "Shoes")}</span>
                            <span className={`equipment-status equipment-status-${item.status}`}>
                              {item.status === "replace" ? "Replace soon" : item.status === "watch" ? "Nearing replacement" : item.status === "retired" ? "Retired" : "Healthy"}
                            </span>
                          </div>
                          <div className="progress-track">
                            <div
                              className={`progress-fill${item.status !== "healthy" && item.status !== "retired" ? " progress-fill-warn" : ""}`}
                              style={{ width: `${Math.min(100, item.percentUsed)}%` }}
                            />
                          </div>
                          <div className="hint" style={{ marginTop: 4 }}>
                            {item.distanceKm}km of an estimated {item.thresholdKm}km ({item.percentUsed}%)
                          </div>
                          <div className="hint" style={{ marginTop: 6, color: "var(--ink)" }}>{item.recommendation}</div>
                          {item.shopUrl && (
                            <a href={item.shopUrl} target="_blank" rel="noreferrer" style={{ fontSize: "calc(12.5px * var(--fs-scale, 1))" }}>
                              Shop replacement options →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {equipment && equipment.items.length === 0 && (
              <div className="panel">
                <h2>Gears Check</h2>
                <div className="hint" style={{ marginTop: 6 }}>
                  No gear retrieved from your Strava profile yet — add shoes or a bike to your
                  activities in Strava, then use Re-sync from Strava in the menu to start tracking wear.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <SiteFooter />
    </div>
  );
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
