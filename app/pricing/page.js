"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import { PLANS, formatUsd } from "@/lib/pricing";
import { TIERS } from "@/lib/membership";

const FREE_FEATURES = [
  "Import your last 30 Strava activities",
  "Race finishing-time predictions (5K–marathon)",
  `AI injury risk, recovery &amp; nutrition analysis — refresh every ${TIERS.free.refreshIntervalDays} days`,
  `AI progressive training plan for an upcoming event — refresh every ${TIERS.free.refreshIntervalDays} days`,
];
const PLUS_FEATURES = ["Everything in Free", `Refresh AI insights &amp; training plan every ${TIERS.plus.refreshIntervalDays} days`];
const PRO_FEATURES = ["Everything in Free", "Unlimited AI refreshes — regenerate anytime your training changes"];

export default function PricingPage() {
  const [interval, setInterval_] = useState("month");

  return (
    <div className="shell">
      <header className="top">
        <Link href="/" className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </Link>
        <nav className="navlinks">
          <ThemeToggle />
          <Link href="/login">Log in</Link>
        </nav>
      </header>

      <section className="pricing" style={{ borderTop: "none", marginTop: 0 }}>
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

      <SiteFooter />
    </div>
  );
}
