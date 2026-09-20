"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import SiteFooter from "@/components/SiteFooter";
import ShareButton from "@/components/ShareButton";
import { EVENT_TYPES, DISTANCE_OPTIONS, GOAL_TIME_OPTIONS } from "@/lib/eventTypes";
import { buildProgressChartSvg } from "@/lib/progressChart";
import { resolveTheme } from "@/lib/theme";

function minEventDate() {
  const d = new Date();
  d.setDate(d.getDate() + 28);
  return d.toISOString().slice(0, 10);
}

function weeksAway(eventDate) {
  const ms = new Date(eventDate).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

// A response can come back with an empty or non-JSON body — a platform
// timeout truncating a slow AI call, a proxy error page, a crashed
// function — and calling res.json() directly on that throws a raw
// "Unexpected end of JSON input" that isn't useful to show anyone. This
// parses defensively and always returns a message, even on failure.
async function safeJson(res) {
  const text = await res.text();
  if (!text) {
    return { ok: false, message: res.ok ? "The server returned an empty response." : `Server error (${res.status}).` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: `Unexpected response from the server (${res.status}).` };
  }
}

export default function TrainingPlanPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [goal, setGoal] = useState(null); // null = none set yet, undefined = loading
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [deviation, setDeviation] = useState(null);
  const [planLocked, setPlanLocked] = useState(false);
  const [nextEligibleAt, setNextEligibleAt] = useState(null);
  const [staleForDifferentGoal, setStaleForDifferentGoal] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [eventType, setEventType] = useState("running");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [targetDistance, setTargetDistance] = useState(DISTANCE_OPTIONS.running[0]);
  const [goalTime, setGoalTime] = useState(GOAL_TIME_OPTIONS[DISTANCE_OPTIONS.running[0]][0]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingEvent, setChangingEvent] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((data) => {
      if (!data.authenticated) { router.push("/login"); return; }
      setMe(data);
    });
    loadGoal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    const readTheme = () => setTheme(document.documentElement.getAttribute("data-theme") || "light");
    readTheme();
    // Keeps the chart's colors in sync if the theme is toggled while this page is open.
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  function changeEventType(next) {
    setEventType(next);
    const firstDistance = DISTANCE_OPTIONS[next][0];
    setTargetDistance(firstDistance);
    setGoalTime(GOAL_TIME_OPTIONS[firstDistance][0]);
  }

  function changeDistance(next) {
    setTargetDistance(next);
    setGoalTime(GOAL_TIME_OPTIONS[next][0]);
  }

  async function loadGoal() {
    try {
      const res = await fetch("/api/event");
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't load your event.");
      setGoal(data.goal || null);
      if (data.goal) {
        await loadPlan();
        loadDeviation();
      }
    } catch (e) {
      setFormError(e.message);
    }
  }

  // Best-effort — this only annotates the plan below when there's
  // something to show (a 'pending' deviation is surfaced on the
  // dashboard instead, with the actions to act on it).
  async function loadDeviation() {
    try {
      const res = await fetch("/api/training-plan/deviation");
      const data = await res.json().catch(() => ({}));
      setDeviation(res.ok && data.active ? data : null);
    } catch {
      setDeviation(null);
    }
  }

  async function loadPlan(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoadingPlan(true);
    setPlanError("");
    try {
      const res = await fetch(`/api/training-plan${refresh ? "?refresh=1" : ""}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't load the training plan.");
      setPlan(data.plan);
      setPlanLocked(Boolean(data.locked));
      setNextEligibleAt(data.nextEligibleAt || null);
      setStaleForDifferentGoal(Boolean(data.staleForDifferentGoal));
      if (!data.plan && data.error) setPlanError(data.error);
      // A regenerated plan clears any deviation computed against the one
      // it replaced (see lib/db.js's saveTrainingPlan) — re-check so a
      // stale acknowledged/pending banner doesn't linger in the UI.
      if (refresh) loadDeviation();
    } catch (e) {
      setPlan(null);
      setPlanError(e.message);
    } finally {
      setLoadingPlan(false);
      setRefreshing(false);
    }
  }

  async function handleSetEvent(e) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType, eventName, eventDate, targetDistance, goalTime }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't save that event.");
      setChangingEvent(false);
      setPlan(null);
      await loadGoal();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearEvent() {
    await fetch("/api/event", { method: "DELETE" });
    setGoal(null);
    setPlan(null);
    setDeviation(null);
    setChangingEvent(false);
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  const showForm = goal === null || changingEvent;

  return (
    <div className="shell">
      <AppHeader
        name={me.name || me.email}
        tier={me.tier}
        isTrial={me.isTrial}
        avatarUrl={me.avatarUrl}
        ouraConnected={me.ouraConnected}
        onOuraChange={(connected) => setMe((m) => (m ? { ...m, ouraConnected: connected } : m))}
      />

      <h2 style={{ fontSize: "calc(20px * var(--fs-scale, 1))", color: "var(--ink)", marginBottom: 18 }}>Training plan</h2>

      {showForm && (
        <div className="panel">
          <h2>{goal ? "Change your upcoming event" : "Set your upcoming event"}</h2>
          <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
            Pick a race at least 4 weeks out and Splitline will build a progressive training, recovery, and
            nutrition plan for it from your last 30 activities.
          </div>
          <form onSubmit={handleSetEvent}>
            <label>Event type</label>
            <select value={eventType} onChange={(e) => changeEventType(e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label>Event name</label>
            <input required value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. City Marathon" />
            <label>Distance</label>
            <select value={targetDistance} onChange={(e) => changeDistance(e.target.value)}>
              {DISTANCE_OPTIONS[eventType].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <label>Goal finish time</label>
            <select value={goalTime} onChange={(e) => setGoalTime(e.target.value)}>
              {GOAL_TIME_OPTIONS[targetDistance].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label>Event date</label>
            <input type="date" required min={minEventDate()} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            {formError && <div className="status-line warn">{formError}</div>}
            <button className="primary" type="submit" disabled={saving} style={{ marginTop: 12 }}>
              {saving ? "Saving…" : "Save event & generate plan"}
            </button>
            {goal && (
              <button type="button" style={{ marginTop: 8 }} onClick={() => setChangingEvent(false)}>Cancel</button>
            )}
          </form>
        </div>
      )}

      {goal && !showForm && (
        <>
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0 }}>{goal.eventName || EVENT_TYPES.find((t) => t.value === goal.eventType)?.label}</h2>
                <div className="hint" style={{ marginTop: 6 }}>
                  {EVENT_TYPES.find((t) => t.value === goal.eventType)?.label}
                  {goal.targetDistance ? ` · ${goal.targetDistance}` : ""}
                  {goal.goalTime ? ` · Goal: ${goal.goalTime}` : ""} ·{" "}
                  {new Date(goal.eventDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" · "}{goal.weeksUntilEvent ?? weeksAway(goal.eventDate)} weeks away
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ width: "auto", padding: "7px 14px" }} onClick={() => setChangingEvent(true)}>Change event</button>
                <button style={{ width: "auto", padding: "7px 14px" }} onClick={handleClearEvent}>Clear</button>
              </div>
            </div>
          </div>

          {deviation?.status === "pending" && (
            <div className="status-line warn" style={{ marginBottom: 0 }}>
              A training plan deviation was detected — <a href="/app">review it on your dashboard</a>.
            </div>
          )}

          {deviation?.status === "acknowledged" && (
            <div className="panel">
              <h2 style={{ margin: 0 }}>Deviation from plan</h2>
              <div className="hint" style={{ color: "var(--ink)", marginTop: 8 }}>{deviation.narrative}</div>
              <div className="hint" style={{ marginTop: 8 }}>
                <strong style={{ color: "var(--ink)" }}>Likelihood this affects your goal: {deviation.goal_impact_likelihood}.</strong>{" "}
                {deviation.goal_impact_narrative}
              </div>
              <div className="hint" style={{ marginTop: 10 }}>
                Per-week notes are marked directly on the phases below. Generated by an AI model comparing your
                recent training against this plan — an estimate, not an exact calculation.
              </div>
            </div>
          )}

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <h2 style={{ margin: 0 }}>AI progressive training plan</h2>
              <div style={{ display: "flex", gap: 8 }}>
                {plan && <ShareButton kind="training-plan" payload={{ athleteName: me.name || me.email, goal, plan }} />}
                <button
                  style={{ width: "auto", padding: "6px 12px" }}
                  onClick={() => loadPlan(true)}
                  disabled={refreshing || loadingPlan || planLocked}
                  title={planLocked ? "Refresh limit reached for your tier" : undefined}
                >
                  {refreshing ? "Regenerating…" : "Refresh plan"}
                </button>
              </div>
            </div>

            {loadingPlan && <div className="hint" style={{ marginTop: 12 }}>Building your plan… this can take up to 30 seconds.</div>}

            {planLocked && (
              <div className="status-line warn" style={{ marginTop: 10 }}>
                You&rsquo;ve used this tier&rsquo;s plan refresh for now
                {nextEligibleAt ? ` — next one available ${new Date(nextEligibleAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}.{" "}
                {staleForDifferentGoal ? "Your event changed since the last plan, so a fresh one isn't ready yet. " : ""}
                <a href="/account">Upgrade to Plus or Pro</a> for more frequent updates.
              </div>
            )}

            {!loadingPlan && plan && (
              <>
                <div className="hint" style={{ color: "var(--ink)", marginTop: 12 }}>{plan.overview}</div>

                <h3 style={{ marginTop: 20 }}>Training progress</h3>
                <div
                  className="progress-chart"
                  dangerouslySetInnerHTML={{
                    __html: buildProgressChartSvg(
                      plan.phases,
                      { bg: resolveTheme(theme).bg, ink: resolveTheme(theme).ink, inkDim: resolveTheme(theme).inkDim, accent: resolveTheme(theme).brand, line: resolveTheme(theme).line },
                      { width: 900, height: 260 }
                    ),
                  }}
                />

                <h3>Phases</h3>
                <div className="phase-list">
                  {plan.phases.map((p, i) => {
                    const weeksForPhase = deviation?.status === "acknowledged"
                      ? (deviation.weekly_review || []).filter((w) => w.phase_name === p.name)
                      : [];
                    return (
                      <div key={i} className="phase-card">
                        <div className="phase-head">
                          <h4>{p.name}</h4>
                          <span className="weeks">{p.weeks}</span>
                        </div>
                        <div className="focus">{p.focus}</div>
                        <div className="volume">{p.weekly_volume_guidance}</div>
                        {p.weekly_time_estimate && <div className="time-estimate">~{p.weekly_time_estimate}</div>}
                        <ul>{p.key_workouts.map((w, wi) => <li key={wi}>{w}</li>)}</ul>
                        {weeksForPhase.length > 0 && (
                          <div className="phase-deviation-notes">
                            <div className="hint" style={{ marginTop: 8, marginBottom: 4, color: "var(--ink)" }}>Actual vs. plan:</div>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {weeksForPhase.map((w, wi) => (
                                <li key={wi} className={`deviation-week-${w.status}`}>
                                  Week {w.week_number}:{" "}
                                  {w.status === "on_track" ? "on track"
                                    : w.status === "missed" ? `missed by ~${w.miss_pct}%`
                                    : w.status === "exceeded" ? `exceeded by ~${w.miss_pct}%`
                                    : "not enough data"} — {w.note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="ai-columns" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 24 }}>
                  <div>
                    <h3>Recovery guidelines</h3>
                    <ul>{plan.recovery_guidelines.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                  <div>
                    <h3>Nutrition plan</h3>
                    <ul>{plan.nutrition_plan.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                  <div>
                    <h3>Pre-race preparation</h3>
                    <ul>{plan.pre_race_prep.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                  <div>
                    <h3>Race day strategy</h3>
                    <ul>{plan.race_day_strategy.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                </div>

                <div className="hint" style={{ marginTop: 16 }}>
                  Generated by an AI model from your recent training patterns — a training heuristic, not a
                  certified coaching or medical service.
                </div>
              </>
            )}

            {!loadingPlan && !plan && !planLocked && (
              <div className="hint" style={{ marginTop: 12 }}>
                {planError ? `Couldn't generate a training plan right now (${planError}).` : "No plan generated yet."}
              </div>
            )}
          </div>
        </>
      )}
      <SiteFooter />
    </div>
  );
}
