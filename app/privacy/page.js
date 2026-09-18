import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";

export const metadata = {
  title: "Privacy Policy — Splitline",
};

export default function PrivacyPage() {
  return (
    <div className="shell">
      <div className="top" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
        <Link href="/" className="wordmark">
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="split">SPLIT</span><span className="line">LINE</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="panel">
        <div className="legal-content">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: September 18, 2026</p>

          <h2>1. Introduction</h2>
          <p>
            Welcome to Splitline (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). We are committed to
            protecting your privacy while delivering AI-driven telemetry summaries, biomechanical and
            overtraining analysis, equipment lifecycle monitoring, race-day pacing and fueling plans, and
            progressive training plans built from your own Strava activity history. This Privacy Policy
            explains how we collect, use, process, and protect your personal and activity data when you use
            Splitline.
          </p>

          <h2>2. Data We Collect</h2>
          <p>
            <strong>Account information.</strong> Your name, email address, and either a password (stored as a
            salted hash — we never see or keep your plain-text password) or a linked Google account. A profile
            photo, which is either fetched from your connected Strava profile or one you upload and crop
            yourself. Date of birth and body weight, both optional and self-reported, used only to sharpen the
            injury-risk and shoe-wear estimates described below. Your membership tier and billing status.
          </p>
          <p>
            <strong>Strava fitness &amp; telemetry data.</strong> Once you connect your Strava account, we
            import your recent activities and their streams — heart rate, power, cadence, elevation, and
            pace/speed — along with activity metadata (name, sport type, date, distance, moving time, calories,
            and device-recorded temperature where Strava provides it) and your registered gear (shoes and
            bikes), including accumulated mileage and retirement status.
          </p>
          <p>
            <strong>Derived biomechanical &amp; training metrics.</strong> Computed from the data above: acute-
            to-chronic training load, aerobic decoupling, cadence drift, a fatigue score, race-pace projections,
            and gear wear-percentage estimates.
          </p>
          <p>
            <strong>Technical &amp; session data.</strong> An encrypted session cookie that keeps you signed
            in, and ordinary web server logs (IP address, browser type) incidental to hosting the application.
            Your theme (light/dark) and font-size preference are stored only in your own browser&rsquo;s local
            storage and are never sent to us.
          </p>

          <h2>3. How We Use Your Data</h2>
          <p>
            <strong>AI-generated insights.</strong> Selected activity and biomechanical data is sent to
            Anthropic&rsquo;s Claude models to generate your injury-risk assessment, recovery and nutrition
            guidance, progressive training plan, and race-day pacing/fueling plan. These are generated on
            demand, or on a refresh schedule tied to your membership tier.
          </p>
          <p>
            <strong>Equipment monitoring.</strong> Comparing your gear&rsquo;s accumulated distance against
            typical wear thresholds to flag shoes or a bike drivetrain nearing replacement.
          </p>
          <p>
            <strong>Account &amp; billing.</strong> Authenticating you, verifying your email address, and
            processing subscription payments via Stripe.
          </p>
          <p>
            <strong>Communication.</strong> Transactional email only — verification codes and account-related
            notices. We do not send marketing email.
          </p>
          <p>We never sell your data, and we do not use it for advertising.</p>

          <h2>4. Data Sharing &amp; Third-Party Services</h2>
          <p>
            <strong>Strava API.</strong> We access and process data in accordance with the Strava API Agreement
            and Developer Guidelines, requesting only the read scopes needed to import your activities, gear,
            and profile. We do not sell your Strava data to third parties.
          </p>
          <p>
            <strong>Anthropic (Claude API).</strong> Processes the specific data described in Section 3 to
            generate your personalized insights.
          </p>
          <p>
            <strong>Stripe.</strong> Processes subscription payments; we never see or store your full card
            number.
          </p>
          <p>
            <strong>Google.</strong> Only if you choose &ldquo;Continue with Google&rdquo; to sign in, in which
            case we receive your name and email from your Google account.
          </p>
          <p>
            <strong>Legal compliance.</strong> We may disclose information if required by applicable law,
            regulation, or legal process.
          </p>

          <h2>5. Data Security &amp; Retention</h2>
          <p>
            Your Strava access and refresh tokens are encrypted at rest (AES-256-GCM); passwords are hashed,
            never stored in plain text; and all traffic to and from Splitline is encrypted in transit (TLS).
            Data is retained for as long as your account remains active, or as needed to provide the analytics
            described above. You may request deletion at any time — see Section 6.
          </p>

          <h2>6. Your Rights &amp; Data Control</h2>
          <p>
            <strong>Revoking Strava access.</strong> You can disconnect Splitline from your Strava account at
            any time from Strava&rsquo;s own connected-apps settings at{" "}
            <a href="https://www.strava.com/settings/apps" target="_blank" rel="noreferrer">strava.com/settings/apps</a>
            ; we immediately stop being able to pull any new data.
          </p>
          <p>
            <strong>Access &amp; export.</strong> Email{" "}
            <a href="mailto:legal@splitline.ai">legal@splitline.ai</a> to request a copy of the personal data we
            hold about you.
          </p>
          <p>
            <strong>Account &amp; data deletion.</strong> Email{" "}
            <a href="mailto:legal@splitline.ai">legal@splitline.ai</a> to request deletion — this permanently
            removes your account, imported activities, gear records, and any cached AI-generated insights from
            our database.
          </p>
          <p>
            <strong>Correcting your profile.</strong> Your name, email, password, date of birth, body weight,
            and profile photo can all be updated directly from your <Link href="/account">Account</Link> page
            at any time.
          </p>

          <h2>7. Children&rsquo;s Privacy</h2>
          <p>
            Splitline is not directed at children, and accounts are restricted to athletes 13 years of age or
            older, consistent with our <Link href="/terms">Terms of Service</Link>.
          </p>

          <h2>8. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time; the &ldquo;Last updated&rdquo; date at the top will
            always reflect the most recent revision. We&rsquo;ll communicate material changes by email or an
            in-app notice.
          </p>

          <h2>9. Contact</h2>
          <p>
            Questions about this policy or your data: <a href="mailto:legal@splitline.ai">legal@splitline.ai</a>.
          </p>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
