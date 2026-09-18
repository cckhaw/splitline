// A static, hand-built preview of what an exported overlay card actually
// looks like (see lib/svg.js's real renderer) — used purely for marketing
// visuals on the home page, never fetched from the API, so it always
// renders instantly with no loading state.
export default function TelemetryCardMock({ compact = false }) {
  return (
    <div className={`telemetry-card-mock${compact ? " compact" : ""}`}>
      <div className="tcm-row">
        <span>SEP 18, 2026</span>
        <span>RUN</span>
      </div>
      <div className="tcm-hero">
        4:32<span className="tcm-unit">/km</span>
      </div>
      <div className="tcm-label">Average pace</div>
      <svg className="tcm-trace" viewBox="0 0 300 60" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`tcmGrad${compact ? "C" : "F"}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: "var(--brand-2)" }} />
            <stop offset="100%" style={{ stopColor: "var(--brand)" }} />
          </linearGradient>
        </defs>
        <path
          d="M0,45 L30,38 L60,42 L90,25 L120,30 L150,15 L180,22 L210,10 L240,18 L270,8 L300,12"
          fill="none"
          stroke={`url(#tcmGrad${compact ? "C" : "F"})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="tcm-stats">
        <div>
          <span className="tcm-stat-label">HR</span>
          <span className="tcm-stat-value">162</span>
        </div>
        <div>
          <span className="tcm-stat-label">Power</span>
          <span className="tcm-stat-value">248W</span>
        </div>
        <div>
          <span className="tcm-stat-label">Elev</span>
          <span className="tcm-stat-value">142m</span>
        </div>
      </div>
    </div>
  );
}
