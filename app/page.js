import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import TelemetryCardMock from "@/components/TelemetryCardMock";
import { BETA_PRO_TRIAL_DAYS } from "@/lib/membership";

const FEATURES = [
  {
    title: "Seamless Strava Sync",
    body: "Instant deep-stream ingest for HR, power curves, cadence, and GPS tracks. Zero manual entry.",
    badge: { text: "Acute Load Score", color: "cyan" },
  },
  {
    title: "Feed-Dominating Overlays",
    body: "Custom telemetry visuals built from your raw stream data. Turn every workout into an architectural statement.",
    badge: { text: "Pacing Matrix", color: "orange" },
  },
  {
    title: "Autonomous Load & Race Intelligence",
    body: "Predictive overtraining detection, acute-to-chronic workload scoring, and real-time race-day pacing engines.",
    badge: { text: "Foam Life: 82%", color: "cyan" },
  },
];

export default function Home() {
  return (
    <div className="shell">
      <header className="top">
        <div className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </div>
        <nav className="navlinks">
          <ThemeToggle />
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Log in</Link>
        </nav>
      </header>

      <section className="hero-grid">
        <div className="hero">
          <h1>Your workout already has the story. Splitline just puts it on the card.</h1>
          <p className="lede">
            Connect Strava once, pull in your last 30 activities, and get a
            telemetry overlay for each one — pace, power, heart rate, and the
            trace itself — styled like a cockpit readout, not a template.
            Post it straight to your Strava feed.
          </p>
          <Link href="/signup">
            <button className="primary navcta wide">
              {BETA_PRO_TRIAL_DAYS > 0
                ? `Sign Up — Free Pro Tier for ${BETA_PRO_TRIAL_DAYS} days`
                : "Sign up — it's free"}
            </button>
          </Link>
        </div>
        <div className="hero-visual">
          <TelemetryCardMock />
        </div>
      </section>

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

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
            <div className={`feature-badge ${f.badge.color}`}>{f.badge.text}</div>
          </div>
        ))}
      </section>

      <SiteFooter />
    </div>
  );
}
