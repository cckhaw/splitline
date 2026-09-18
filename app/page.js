"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { PLANS, formatUsd } from "@/lib/pricing";
import { TIERS, BETA_PRO_TRIAL_DAYS } from "@/lib/membership";

const FREE_FEATURES = [
  "Import your last 30 Strava activities",
  "Race finishing-time predictions (5K–marathon)",
  `AI injury risk, recovery &amp; nutrition analysis — refresh every ${TIERS.free.refreshIntervalDays} days`,
  `AI progressive training plan for an upcoming event — refresh every ${TIERS.free.refreshIntervalDays} days`,
];
const PLUS_FEATURES = ["Everything in Free", `Refresh AI insights &amp; training plan every ${TIERS.plus.refreshIntervalDays} days`];
const PRO_FEATURES = ["Everything in Free", "Unlimited AI refreshes — regenerate anytime your training changes"];

export default function Home() {
  const [interval, setInterval_] = useState("month");

  return (
    <div className="shell">
      <header className="top">
        <div className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </div>
        <nav className="navlinks">
          <ThemeToggle />
          <Link href="/login">Log in</Link>
        </nav>
      </header>

      {BETA_PRO_TRIAL_DAYS > 0 && (
        <div className="beta-banner">
          <span>
            <strong>Beta testers get Pro tier free for {BETA_PRO_TRIAL_DAYS} days</strong> — unlimited AI refreshes, on us, while we're building this out.
          </span>
          <Link href="/signup">
            <button className="primary" style={{ width: "auto", padding: "8px 16px" }}>Claim it — sign up</button>
          </Link>
        </div>
      )}

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
          <h3>AI training &amp; race guidance</h3>
          <p>Injury-risk, recovery, nutrition, and a full progressive training plan for your next race — computed from your own imported history.</p>
        </div>
      </section>

      <section className="pricing">
        <h2 className="pricing-heading">Plans</h2>
        <div className="toggle-group" style={{ justifyContent: "center", marginBottom: 28 }}>
          <div className={`toggle${interval === "month" ? " active" : ""}`} onClick={() => setInterval_("month")}>Monthly</div>
          <div className={`toggle${interval === "year" ? " active" : ""}`} onClick={() => setInterval_("year")}>Yearly</div>
        </div>

        <div className="pricing-grid">
          <div className="pricing-card">
            <h3>Free</h3>
            <div className="pricing-price">$0</div>
            <div className="hint" style={{ marginTop: 0 }}>Forever</div>
            <ul className="pricing-features">
              {FREE_FEATURES.map((f, i) => <li key={i} dangerouslySetInnerHTML={{ __html: f }} />)}
            </ul>
            <Link href="/signup"><button style={{ marginTop: 8 }}>Sign up free</button></Link>
          </div>

          {Object.values(PLANS).map((plan) => {
            const price = interval === "year" ? plan.yearly : plan.monthly;
            return (
              <div key={plan.tier} className={`pricing-card${plan.tier === "pro" ? " featured" : ""}`}>
                <h3>{plan.label}</h3>
                <div className="pricing-price">
                  {formatUsd(price.amountCents)}<span>/{interval === "year" ? "yr" : "mo"}</span>
                </div>
                <div className="hint" style={{ marginTop: 0 }}>{plan.tagline}</div>
                <ul className="pricing-features">
                  {(plan.tier === "plus" ? PLUS_FEATURES : PRO_FEATURES).map((f, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: f }} />
                  ))}
                </ul>
                <Link href="/signup"><button className={plan.tier === "pro" ? "primary" : undefined} style={{ marginTop: 8 }}>Get started</button></Link>
              </div>
            );
          })}
        </div>
        <div className="hint" style={{ textAlign: "center", marginTop: 20 }}>
          Sign up free, then upgrade anytime from your account page. Promo codes are supported at checkout.
        </div>
      </section>

      <footer className="foot">
        <span>Splitline</span>
        <span>Built on Strava&rsquo;s API. Not affiliated with or endorsed by Strava.</span>
      </footer>
    </div>
  );
}
