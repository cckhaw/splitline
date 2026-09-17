import Link from "next/link";

export default function Home() {
  return (
    <div className="shell">
      <header className="top">
        <div className="wordmark">SPLIT<span>LINE</span></div>
        <nav className="navlinks">
          <Link href="/login">Log in</Link>
          <Link href="/signup">
            <button className="primary navcta">Sign up free</button>
          </Link>
        </nav>
      </header>

      <section className="hero">
        <h1>Your workout already has the story. Splitline just puts it on the card.</h1>
        <p className="lede">
          Connect Strava once, pull in your last 30 activities, and get a
          telemetry overlay for each one — pace, power, heart rate, and the
          trace itself — styled like a cockpit readout, not a template.
          Post it straight to your Strava feed.
        </p>
        <Link href="/signup">
          <button className="primary navcta wide">Get started — it&rsquo;s free</button>
        </Link>
      </section>

      <section className="features">
        <div className="feature">
          <h3>30 activities, one import</h3>
          <p>Connect your Strava account and Splitline pulls your last 30 activities with full telemetry — no manual entry, no screenshots.</p>
        </div>
        <div className="feature">
          <h3>Cards worth posting</h3>
          <p>Three themes, four hero metrics, three trace types. Every card comes from your workout&rsquo;s real numbers, not a stock layout.</p>
        </div>
        <div className="feature">
          <h3>Training load &amp; race pace</h3>
          <p>A rolling load balance and race-time projections, computed from your own imported history — not a generic training plan.</p>
        </div>
      </section>

      <footer className="foot">
        <span>Splitline</span>
        <span>Built on Strava&rsquo;s API. Not affiliated with or endorsed by Strava.</span>
      </footer>
    </div>
  );
}
