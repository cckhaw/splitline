"use client";

import { THEMES } from "@/lib/svg";
import { prepareTelemetryDisplay } from "@/lib/telemetryDisplay";

const ZONE_COLOR_KEY = { fresh: "secondary", moderate: "accent", fatigued: "critical" };

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
function arcPath(cx, cy, r, from, to) {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const largeArc = Math.abs(from - to) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

// A real, responsive HTML panel (not a rendered image) so the numbers are
// selectable/readable at any width — "Save as image" (the parent
// dashboard's button) renders a *separate* flat picture from the same
// data via lib/telemetrySummarySvg.js for posting, so this component only
// ever needs to look good live on screen.
export default function TelemetryPanel({ summary, theme, units }) {
  const t = THEMES[theme || "ink"];
  const critical = "#D2604B";
  const d = prepareTelemetryDisplay(summary, units);

  const gx = 120, gy = 110, gr = 92, bandWidth = 20;
  const zoneHex = { secondary: t.secondary, accent: t.accent, critical };
  const zones = [
    { from: 180, to: 120, color: t.secondary },
    { from: 120, to: 60, color: t.accent },
    { from: 60, to: 0, color: critical },
  ];
  const needleAngle = 180 * (1 - d.fatigueScore / 100);
  const needleTip = polar(gx, gy, gr - bandWidth / 2 - 6, needleAngle);
  const needleColor = zoneHex[ZONE_COLOR_KEY[d.zoneKey]] || t.ink;

  const trendMin = d.hasTrend ? Math.min(...d.trace) : 0;
  const trendMax = d.hasTrend ? Math.max(...d.trace) : 0;
  const trendRange = trendMax - trendMin || 1;

  const recoveryMin = d.hasRecoveryTrend ? Math.min(...d.recoveryTrace) : 0;
  const recoveryMax = d.hasRecoveryTrend ? Math.max(...d.recoveryTrace) : 0;
  const recoveryRange = recoveryMax - recoveryMin || 1;
  const recoveryColor = d.underRecoveryFlag ? critical : t.secondary;

  return (
    <div className="telemetry-panel" style={{ background: t.bg, color: t.ink, borderColor: t.line }}>
      <div className="telemetry-header">
        <div className="telemetry-title" style={{ color: t.ink }}>Activity Summary</div>
        <div className="telemetry-period" style={{ color: t.dim }}>
          {d.periodFrom} – {d.periodTo} · {d.sampleSize} activities
        </div>
      </div>
      <div className="telemetry-hr" style={{ background: t.line }} />

      <div className="telemetry-hero">
        <div className="telemetry-label" style={{ color: t.dim }}>Total training time</div>
        <div className="telemetry-hero-value" style={{ color: t.accent }}>
          {d.totalHoursStr}<span className="telemetry-hero-unit" style={{ color: t.dim }}>hours</span>
        </div>
        <div className="telemetry-caption" style={{ color: t.dim }}>
          across {d.periodDays} days{d.acwr != null ? ` · acute:chronic load ${d.acwr}` : ""}
        </div>
      </div>

      {d.tiles.length > 0 && (
        <div className="telemetry-tiles">
          {d.tiles.map((s) => (
            <div key={s.label} className="telemetry-tile" style={{ borderColor: t.line }}>
              <div className="telemetry-label" style={{ color: t.dim }}>{s.label}</div>
              <div className="telemetry-tile-value" style={{ color: t.ink }}>
                {s.value}<span style={{ color: t.dim }}>{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="telemetry-gauge-wrap">
        <div className="telemetry-label" style={{ color: t.dim, textAlign: "center" }}>Fatigue</div>
        <svg viewBox="0 0 240 150" className="telemetry-gauge">
          {zones.map((z) => (
            <path key={z.from} d={arcPath(gx, gy, gr, z.from, z.to)} fill="none" stroke={z.color} strokeWidth={bandWidth} />
          ))}
          <line x1={gx} y1={gy} x2={needleTip.x} y2={needleTip.y} stroke={t.ink} strokeWidth="4" strokeLinecap="round" />
          <circle cx={gx} cy={gy} r="8" fill={t.ink} />
        </svg>
        <div className="telemetry-gauge-score" style={{ color: needleColor }}>{d.fatigueScore}</div>
        <div className="telemetry-caption" style={{ color: t.dim, textAlign: "center" }}>{d.zoneLabel}</div>
        {d.hoursSinceLastActivity != null && (
          <div className="telemetry-caption" style={{ color: t.dim, textAlign: "center" }}>
            {Math.round(d.hoursSinceLastActivity)}h since last activity
          </div>
        )}
      </div>

      <div className="telemetry-trend">
        <div className="telemetry-label" style={{ color: t.dim }}>Training intensity across the period</div>
        {d.hasTrend ? (
          <div className="telemetry-trend-bars">
            {d.trace.map((v, i) => {
              const isLast = i === d.trace.length - 1;
              const pct = Math.max(6, ((v - trendMin) / trendRange) * 100);
              return (
                <div
                  key={i}
                  className="telemetry-trend-bar"
                  style={{ height: `${pct}%`, background: isLast ? t.accent : t.secondary, opacity: isLast ? 1 : 0.45 }}
                />
              );
            })}
          </div>
        ) : (
          <div className="telemetry-caption" style={{ color: t.dim }}>Import a few more activities to see a trend here</div>
        )}
      </div>

      {d.ouraConnected ? (
        <>
          {d.recoveryTiles.length > 0 && (
            <div className="telemetry-tiles" style={{ marginTop: 4 }}>
              {d.recoveryTiles.map((s) => (
                <div key={s.label} className="telemetry-tile" style={{ borderColor: t.line }}>
                  <div className="telemetry-label" style={{ color: t.dim }}>{s.label}</div>
                  <div className="telemetry-tile-value" style={{ color: t.ink }}>
                    {s.value}<span style={{ color: t.dim }}>{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="telemetry-trend">
            <div className="telemetry-label" style={{ color: t.dim }}>Recovery across the period (daily readiness)</div>
            {d.hasRecoveryTrend ? (
              <div className="telemetry-trend-bars">
                {d.recoveryTrace.map((v, i) => {
                  const isLast = i === d.recoveryTrace.length - 1;
                  const pct = Math.max(6, ((v - recoveryMin) / recoveryRange) * 100);
                  return (
                    <div
                      key={i}
                      className="telemetry-trend-bar"
                      style={{ height: `${pct}%`, background: isLast ? recoveryColor : t.secondary, opacity: isLast ? 1 : 0.45 }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="telemetry-caption" style={{ color: t.dim }}>Not enough nights synced yet to show a recovery trend</div>
            )}
            {d.readinessLabel && (
              <div className="telemetry-caption" style={{ color: d.underRecoveryFlag ? critical : t.dim, marginTop: 4 }}>
                {d.readinessLabel}{d.underRecoveryFlag ? " — HRV down and resting HR up this week, a real under-recovery signal" : ""}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="telemetry-trend">
          <div className="telemetry-caption" style={{ color: t.dim }}>
            Connect an Oura Ring from the dashboard to see sleep, HRV, and readiness here too.
          </div>
        </div>
      )}

      <div className="telemetry-footer" style={{ color: t.dim, borderColor: t.line }}>
        <span>SPLITLINE</span>
        <span>{d.movingTimeStr} total moving time</span>
      </div>
    </div>
  );
}
