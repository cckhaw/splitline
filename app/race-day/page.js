"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import SiteFooter from "@/components/SiteFooter";
import ShareButton from "@/components/ShareButton";
import { buildCourseProfileChartSvg } from "@/lib/courseProfileChart";
import { resolveTheme } from "@/lib/theme";

// A response can come back with an empty or non-JSON body — a platform
// timeout truncating a slow AI call, a proxy error page, a crashed
// function — and calling res.json() directly on that throws a raw
// "Unexpected end of JSON input" that isn't useful to show anyone. This
// parses defensively and always returns a message, even on failure.
async function safeJson(res) {
  const text = await res.text();
  if (!text) {
    return { message: res.ok ? "The server returned an empty response." : `Server error (${res.status}).` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: `Unexpected response from the server (${res.status}).` };
  }
}

const WEATHER_SOURCE_LABEL = {
  forecast: "16-day forecast",
  historical_average: "historical average for this date",
  manual: "entered manually",
};

function planAsText(goal, plan) {
  const lines = [
    `SPLITLINE — Race Day Plan for ${goal?.eventName || "your event"}`,
    goal?.eventDate ? new Date(goal.eventDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "",
    "",
    "PACING STRATEGY",
    plan.pacing_strategy,
    "",
    "SEGMENT PACING",
    ...plan.segment_pacing.map((s) => `- ${s.segment_label}: ${s.target_pace} — ${s.notes}`),
    "",
    "FUELING PLAN",
    ...plan.fueling_plan.map((f) => `- ${f}`),
    "",
    "HEAT / ALTITUDE ADJUSTMENTS",
    ...plan.heat_altitude_adjustments.map((f) => `- ${f}`),
    "",
    "PRE-RACE CHECKLIST",
    ...plan.pre_race_checklist.map((f) => `- ${f}`),
    "",
    "CONTINGENCIES",
    ...plan.contingency_notes.map((f) => `- ${f}`),
  ];
  return lines.join("\n");
}

export default function RaceDayPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [goal, setGoal] = useState(undefined); // undefined = loading, null = none set
  const [goalError, setGoalError] = useState("");
  const [theme, setTheme] = useState("light");

  const [course, setCourse] = useState(null); // null = none uploaded
  const [courseUploading, setCourseUploading] = useState(false);
  const [courseError, setCourseError] = useState("");
  const fileInputRef = useRef(null);

  const [weather, setWeather] = useState(null); // last fetch result, for the source note
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [temperatureC, setTemperatureC] = useState("15");
  const [temperatureMinC, setTemperatureMinC] = useState(null);
  const [temperatureMaxC, setTemperatureMaxC] = useState(null);
  const [humidityPct, setHumidityPct] = useState("");
  const [temperatureSource, setTemperatureSource] = useState("manual");
  const [courseElevationGainM, setCourseElevationGainM] = useState("");

  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [planLocked, setPlanLocked] = useState(false);
  const [nextEligibleAt, setNextEligibleAt] = useState(null);
  const [staleForDifferentInputs, setStaleForDifferentInputs] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((data) => {
      if (!data.authenticated) { router.push("/login"); return; }
      setMe(data);
    });
    loadExisting();
    loadCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    const readTheme = () => setTheme(document.documentElement.getAttribute("data-theme") || "light");
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  async function loadExisting() {
    setLoadingPlan(true);
    try {
      const res = await fetch("/api/race-day");
      const data = await safeJson(res);
      if (res.status === 400 && data.error === "no_goal") {
        setGoal(null);
        return;
      }
      if (!res.ok) throw new Error(data.message || "Couldn't load your race-day plan.");
      setGoal(data.goal);
      setPlan(data.plan);
      if (data.raceDayInputs) {
        setTemperatureC(String(data.raceDayInputs.temperatureC));
        setTemperatureMinC(data.raceDayInputs.temperatureMinC ?? null);
        setTemperatureMaxC(data.raceDayInputs.temperatureMaxC ?? null);
        setHumidityPct(data.raceDayInputs.humidityPct != null ? String(data.raceDayInputs.humidityPct) : "");
        setTemperatureSource(data.raceDayInputs.temperatureSource || "manual");
        setCourseElevationGainM(String(data.raceDayInputs.courseElevationGainM));
      }
    } catch (e) {
      setGoalError(e.message);
    } finally {
      setLoadingPlan(false);
    }
  }

  async function loadCourse() {
    try {
      const res = await fetch("/api/race-day/course");
      const data = await safeJson(res);
      if (res.ok && data.course) {
        setCourse(data.course);
        setCourseElevationGainM(String(Math.round(data.course.totalElevationGainM)));
      }
    } catch {
      // Best-effort — the manual elevation field still works without it.
    }
  }

  async function handleGpxUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCourseUploading(true);
    setCourseError("");
    try {
      const gpxXml = await file.text();
      const res = await fetch("/api/race-day/course", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, gpxXml }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't read that GPX file.");
      setCourse(data.course);
      setCourseElevationGainM(String(Math.round(data.course.totalElevationGainM)));
      setWeather(null);
    } catch (e) {
      setCourseError(e.message);
    } finally {
      setCourseUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveCourse() {
    await fetch("/api/race-day/course", { method: "DELETE" });
    setCourse(null);
    setWeather(null);
    setCourseElevationGainM("");
  }

  async function handleGetWeather() {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const res = await fetch("/api/race-day/weather");
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't fetch weather for this event.");
      setWeather(data.weather);
      if (data.weather.source === "unavailable") {
        setWeatherError(
          data.weather.reason === "no_location"
            ? "Upload a GPX course first — that's where the location for a weather lookup comes from."
            : "Couldn't fetch weather right now — enter your own estimate below."
        );
        setTemperatureSource("manual");
      } else {
        setTemperatureC(String(data.weather.temperatureC));
        setTemperatureMinC(data.weather.temperatureMinC ?? null);
        setTemperatureMaxC(data.weather.temperatureMaxC ?? null);
        if (data.weather.humidityPct != null) setHumidityPct(String(data.weather.humidityPct));
        setTemperatureSource(data.weather.source);
      }
    } catch (e) {
      setWeatherError(e.message);
    } finally {
      setWeatherLoading(false);
    }
  }

  function handleManualTemperatureChange(value) {
    setTemperatureC(value);
    setTemperatureSource("manual");
    setTemperatureMinC(null);
    setTemperatureMaxC(null);
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setPlanError("");
    try {
      const res = await fetch("/api/race-day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          temperatureC: Number(temperatureC),
          temperatureMinC, temperatureMaxC,
          humidityPct: humidityPct === "" ? null : Number(humidityPct),
          courseElevationGainM: Number(courseElevationGainM),
          temperatureSource,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.message || "Couldn't generate that plan.");
      setPlan(data.plan);
      setPlanLocked(Boolean(data.locked));
      setNextEligibleAt(data.nextEligibleAt || null);
      setStaleForDifferentInputs(Boolean(data.staleForDifferentInputs));
      if (!data.plan && data.error) setPlanError(data.error);
    } catch (e) {
      setPlan(null);
      setPlanError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function downloadPlan() {
    const text = planAsText(goal, plan);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "splitline-race-day-plan.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!me) return <div className="shell"><div className="status-line">Loading…</div></div>;

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

      <h2 style={{ fontSize: "calc(20px * var(--fs-scale, 1))", color: "var(--ink)", marginBottom: 18 }}>Race Day Plan</h2>

      {goal === undefined && loadingPlan && <div className="status-line">Loading…</div>}

      {goal === null && (
        <div className="panel">
          <h2>Set an event first</h2>
          <div className="hint" style={{ marginTop: -8 }}>
            The Race Day Plan builds on the event you set on the{" "}
            <a href="/training-plan">Training plan</a> page — set one there, then come back here.
          </div>
        </div>
      )}

      {goalError && <div className="status-line warn">{goalError}</div>}

      {goal && (
        <>
          <div className="panel">
            <h2 style={{ margin: 0 }}>{goal.eventName}</h2>
            <div className="hint" style={{ marginTop: 6 }}>
              {goal.targetDistance}{goal.goalTime ? ` · Goal: ${goal.goalTime}` : ""} ·{" "}
              {new Date(goal.eventDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Race course</h2>
              {course && (
                <button style={{ width: "auto", padding: "6px 12px" }} onClick={handleRemoveCourse}>Remove course</button>
              )}
            </div>
            <div className="hint" style={{ marginTop: 6, marginBottom: 12 }}>
              Upload the course as a GPX file for a real elevation profile — Splitline calculates the full
              course distance and elevation gain/loss from it and grounds the pacing plan below in your
              actual terrain instead of a single flat elevation-gain estimate.
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,application/gpx+xml"
              onChange={handleGpxUpload}
              disabled={courseUploading}
            />
            {courseUploading && <div className="hint" style={{ marginTop: 8 }}>Reading course file…</div>}
            {courseError && <div className="status-line warn" style={{ marginTop: 8 }}>{courseError}</div>}

            {course && (
              <>
                <div className="pace-grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, 1fr)" }}>
                  <div className="pace-cell">
                    <div className="hint">Distance</div>
                    <div className="pace-time">{course.totalDistanceKm}km</div>
                  </div>
                  <div className="pace-cell">
                    <div className="hint">Elevation gain</div>
                    <div className="pace-time">{Math.round(course.totalElevationGainM)}m</div>
                  </div>
                  <div className="pace-cell">
                    <div className="hint">Elevation loss</div>
                    <div className="pace-time">{Math.round(course.totalElevationLossM)}m</div>
                  </div>
                  <div className="pace-cell">
                    <div className="hint">Elevation range</div>
                    <div className="pace-time">
                      {course.hasElevationData ? `${Math.round(course.minElevationM)}–${Math.round(course.maxElevationM)}m` : "—"}
                    </div>
                  </div>
                </div>
                {course.filename && <div className="hint" style={{ marginTop: 8 }}>From {course.filename}</div>}
                <div
                  className="progress-chart"
                  dangerouslySetInnerHTML={{
                    __html: buildCourseProfileChartSvg(
                      course.profile,
                      { bg: resolveTheme(theme).bg, ink: resolveTheme(theme).ink, inkDim: resolveTheme(theme).inkDim, accent: resolveTheme(theme).brand, line: resolveTheme(theme).line },
                      { width: 900, height: 240 }
                    ),
                  }}
                />
              </>
            )}
          </div>

          <div className="panel">
            <h2>Race-day conditions</h2>
            <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
              {course
                ? "Course elevation comes from your uploaded GPX. Get a weather forecast (or, for a date too far out, a historical average) for the course's location, or enter your own estimate."
                : "Upload a course above for automatic elevation and weather, or enter your own estimates below."}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <button type="button" style={{ width: "auto", padding: "7px 14px" }} onClick={handleGetWeather} disabled={weatherLoading || !course}>
                {weatherLoading ? "Checking weather…" : "Get weather for race day"}
              </button>
              {temperatureSource !== "manual" && (
                <span className="hint">
                  Source: {WEATHER_SOURCE_LABEL[temperatureSource]}
                  {weather?.sampleYears ? ` (${weather.sampleYears}-year average)` : ""}
                </span>
              )}
            </div>
            {weatherError && <div className="status-line warn" style={{ marginBottom: 12 }}>{weatherError}</div>}

            <form onSubmit={handleGenerate}>
              <label>Expected temperature (°C){temperatureMinC != null && temperatureMaxC != null ? ` — range ${temperatureMinC}–${temperatureMaxC}°C` : ""}</label>
              <input type="number" required min={-20} max={55} value={temperatureC} onChange={(e) => handleManualTemperatureChange(e.target.value)} />
              <label>Expected humidity (%, optional)</label>
              <input type="number" min={0} max={100} placeholder="e.g. 60" value={humidityPct} onChange={(e) => setHumidityPct(e.target.value)} />
              <label>Course total elevation gain (m)</label>
              {course ? (
                <div className="hint" style={{ color: "var(--ink)" }}>
                  {Math.round(course.totalElevationGainM)}m — from your uploaded GPX course above
                </div>
              ) : (
                <input type="number" required min={0} max={12000} value={courseElevationGainM} onChange={(e) => setCourseElevationGainM(e.target.value)} />
              )}
              {planError && <div className="status-line warn">{planError}</div>}
              <button className="primary" type="submit" disabled={generating || loadingPlan} style={{ marginTop: 12 }}>
                {generating ? "Building your plan…" : plan ? "Regenerate plan" : "Generate plan"}
              </button>
            </form>
          </div>

          {loadingPlan && <div className="hint">Loading…</div>}

          {planLocked && (
            <div className="status-line warn" style={{ marginTop: -4, marginBottom: 12 }}>
              You&rsquo;ve used this tier&rsquo;s refresh for now
              {nextEligibleAt ? ` — next one available ${new Date(nextEligibleAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}.{" "}
              {staleForDifferentInputs ? "Your conditions changed since the last plan, so a fresh one isn't ready yet. " : ""}
              <a href="/account">Upgrade to Plus or Pro</a> for more frequent updates.
            </div>
          )}

          {!loadingPlan && plan && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Your pacing &amp; fueling plan</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <ShareButton kind="race-day" payload={{ athleteName: me.name || me.email, goal, plan, course }} />
                  <button style={{ width: "auto", padding: "6px 12px" }} onClick={downloadPlan}>Download as text</button>
                </div>
              </div>

              <div className="hint" style={{ color: "var(--ink)", marginTop: 12 }}>{plan.pacing_strategy}</div>

              <h3 style={{ marginTop: 20 }}>Segment pacing</h3>
              <div className="phase-list">
                {plan.segment_pacing.map((s, i) => (
                  <div key={i} className="phase-card">
                    <div className="phase-head">
                      <h4>{s.segment_label}</h4>
                      <span className="weeks">{s.target_pace}</span>
                    </div>
                    <div className="focus">{s.notes}</div>
                  </div>
                ))}
              </div>

              <div className="ai-columns" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 24 }}>
                <div>
                  <h3>Fueling plan</h3>
                  <ul>{plan.fueling_plan.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <h3>Heat &amp; altitude adjustments</h3>
                  <ul>{plan.heat_altitude_adjustments.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <h3>Pre-race checklist</h3>
                  <ul>{plan.pre_race_checklist.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <h3>Contingencies</h3>
                  <ul>{plan.contingency_notes.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              </div>

              <div className="hint" style={{ marginTop: 16 }}>
                Generated by an AI model from your own training data{course ? ", your uploaded course profile," : ""} and
                the conditions above — a pacing heuristic, not a certified coaching service, and it can&rsquo;t
                account for anything that changes on race day itself.
              </div>
            </div>
          )}

          {!loadingPlan && !plan && !planLocked && (
            <div className="hint">No plan generated yet — fill in the conditions above and hit Generate.</div>
          )}
        </>
      )}
      <SiteFooter />
    </div>
  );
}
