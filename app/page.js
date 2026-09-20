import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import TelemetryCardMock from "@/components/TelemetryCardMock";
import { BETA_PRO_TRIAL_DAYS } from "@/lib/membership";

// Small inline mini-visuals for the feature grid — each one echoes the
// real dashboard element it describes (the fatigue gauge's 3-band arc,
// the elevation-profile chart, a glowing telemetry trace) rather than
// generic decoration, using the same status-color tokens those real
// charts use elsewhere in the app.
function FeatureVisual({ kind }) {
  if (kind === "dial") {
    return (
      <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
        <path d="M8 40 A28 28 0 0 1 30.5 13.5" stroke="var(--teal)" strokeWidth="7" strokeLinecap="round" />
        <path d="M30.5 13.5 A28 28 0 0 1 41.5 13.5" stroke="var(--amber)" strokeWidth="7" strokeLinecap="round" />
        <path d="M41.5 13.5 A28 28 0 0 1 64 40" stroke="var(--coral)" strokeWidth="7" strokeLinecap="round" />
        <line x1="36" y1="40" x2="50" y2="20" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="36" cy="40" r="3" fill="var(--ink)" />
      </svg>
    );
  }
  if (kind === "elevation") {
    return (
      <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
        <path d="M2 34 L14 26 L24 30 L34 14 L46 20 L58 8 L70 16 L70 40 L2 40 Z" fill="var(--brand)" fillOpacity="0.16" />
        <path d="M2 34 L14 26 L24 30 L34 14 L46 20 L58 8 L70 16" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="68" height="40" rx="7" fill="var(--card-dark)" stroke="var(--brand-cyan)" strokeOpacity="0.5" />
      <path d="M10 30 L22 24 L32 27 L44 14 L60 18" stroke="var(--brand-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FEATURES = [
  {
    title: "Cockpit Telemetry Engine",
    body: "Studio-grade overlay cards rendered straight from your own Strava stream data — pace, power, and heart rate, styled like a cockpit readout instead of a stock activity post.",
    visual: "card",
  },
  {
    title: "Biomechanical Injury Shield",
    body: "Aerobic decoupling and acute:chronic workload spikes, flagged before they become an overuse injury — physics-computed from your own streams, sharpened further with an AI read.",
    visual: "dial",
  },
  {
    title: "Autonomous Race Pacing",
    body: "Upload your race as a GPX file and get forecasted (or historical) weather plus a grade-adjusted, segment-by-segment pacing and fueling plan.",
    visual: "elevation",
  },
];

export default function Home() {
  return (
    <div className="shell">
      <div className="announce-bar">
        <Link href="/signup">
          <strong>Limited beta</strong>
          {" — "}
          {BETA_PRO_TRIAL_DAYS > 0 ? `free Pro tier for ${BETA_PRO_TRIAL_DAYS} days.` : "sign up free."}
          {" "}Claim Pro access →
        </Link>
      </div>

      <header className="top">
        <div className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </div>
        <nav className="navlinks">
          <Link href="#features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <ThemeToggle />
          <Link href="/login">Log in</Link>
        </nav>
      </header>

      <section className="hero-grid">
        <div className="hero">
          <h1>Stop posting screenshots.<br />Decode your telemetry.</h1>
          <p className="lede">
            Connect Strava in one click. Splitline turns raw time-series data — heart rate drift, power
            curves, and grade-adjusted pace — into feed-dominating visuals and an AI-built race strategy.
          </p>
          <Link href="/signup">
            <button className="primary hero-cta">Connect with Strava — Free</button>
          </Link>
        </div>
        <div className="hero-visual">
          <div className="hero-showcase">
            <div className="hero-phone">
              <div className="hero-phone-notch" />
              <TelemetryCardMock />
            </div>
            <div className="floating-badge badge-left">
              <span className="floating-badge-label">Acute load score</span>
              <span className="floating-badge-value">78%<em>Optimal</em></span>
            </div>
            <div className="floating-badge badge-right">
              <span className="floating-badge-label">Puma Skyrocket Lite</span>
              <span className="floating-badge-value">82%<em>life left</em></span>
            </div>
          </div>
        </div>
      </section>

      <div className="trust-banner">
        <span>Powered by Model Context Protocol</span>
        <span className="trust-sep">·</span>
        <span>Strava API ready</span>
        <span className="trust-sep">·</span>
        <span>Oura Ring sync</span>
      </div>

      <section className="feed-proof">
        <div>
          <h2>See it land on your feed</h2>
          <p className="lede" style={{ marginBottom: 0 }}>
            Every card is rendered straight from your own stream data — not a template with your name
            dropped in — so it reads like a cockpit readout next to everyone else&rsquo;s stock activity post.
          </p>
        </div>
        <div className="feed-mock">
          <div className="feed-mock-head">
            <div className="feed-mock-avatar" />
            <div>
              <div className="feed-mock-name">You</div>
              <div className="feed-mock-meta">Just now · Strava</div>
            </div>
          </div>
          <div className="feed-mock-title">Tempo Run — 8.2 km</div>
          <div className="feed-mock-image">
            <TelemetryCardMock compact />
          </div>
          <div className="feed-mock-actions">
            <span>Kudos</span>
            <span>Comment</span>
            <span>Share</span>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
            <div className="feature-visual"><FeatureVisual kind={f.visual} /></div>
          </div>
        ))}
      </section>

      <SiteFooter />
    </div>
  );
}
