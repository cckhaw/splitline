"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { EVENT_TYPES, DISTANCE_OPTIONS } from "@/lib/eventTypes";

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
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [eventType, setEventType] = useState("running");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [targetDistance, setTargetDistance] = useState(DISTANCE_OPTIONS.running[0]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingEvent, setChangingEvent] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((data) => {
      if (!data.authenticated) { router.push("/login"); return; }
      setMe(data);
    });
    loadGoal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function changeEventType(next) {
    setEventType(next);
    setTargetDistance(DISTANCE_OPTIONS[next][0]);
  }

  async function loadGoal() {
    try {
      const res = await fetch("/api/event");
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't load your event.");
      setGoal(data.goal || null);
      if (data.goal) await loadPlan();
    } catch (e) {
      setFormError(e.message);
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
      if (!data.plan && data.error) setPlanError(data.error);
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
        body: JSON.stringify({ eventType, eventName, eventDate, targetDistance }),
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
    setChangingEvent(false);
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

  const showForm = goal === null || changingEvent;

  return (
    <div className="shell">
      <header className="top">
        <div className="wordmark">SPLIT<span>LINE</span></div>
        <nav className="navlinks">
          <Link href="/app">Dashboard</Link>
          <ThemeToggle />
        </nav>
      </header>

      <h2 style={{ fontSize: 20, color: "var(--ink)", marginBottom: 18 }}>Training plan</h2>

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
            <select value={targetDistance} onChange={(e) => setTargetDistance(e.target.value)}>
              {DISTANCE_OPTIONS[eventType].map((d) => <option key={d} value={d}>{d}</option>)}
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
                  {goal.targetDistance ? ` · ${goal.targetDistance}` : ""} ·{" "}
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

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <h2 style={{ margin: 0 }}>AI progressive training plan</h2>
              <button style={{ width: "auto", padding: "6px 12px" }} onClick={() => loadPlan(true)} disabled={refreshing || loadingPlan}>
                {refreshing ? "Regenerating…" : "Refresh plan"}
              </button>
            </div>

            {loadingPlan && <div className="hint" style={{ marginTop: 12 }}>Building your plan… this can take up to 30 seconds.</div>}

            {!loadingPlan && plan && (
              <>
                <div className="hint" style={{ color: "var(--ink)", marginTop: 12 }}>{plan.overview}</div>

                <h3 style={{ marginTop: 20 }}>Phases</h3>
                <div className="phase-list">
                  {plan.phases.map((p, i) => (
                    <div key={i} className="phase-card">
                      <div className="phase-head">
                        <h4>{p.name}</h4>
                        <span className="weeks">{p.weeks}</span>
                      </div>
                      <div className="focus">{p.focus}</div>
                      <div className="volume">{p.weekly_volume_guidance}</div>
                      <ul>{p.key_workouts.map((w, wi) => <li key={wi}>{w}</li>)}</ul>
                    </div>
                  ))}
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

            {!loadingPlan && !plan && (
              <div className="hint" style={{ marginTop: 12 }}>
                {planError ? `Couldn't generate a training plan right now (${planError}).` : "No plan generated yet."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
