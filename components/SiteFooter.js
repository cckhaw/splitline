import Link from "next/link";

// Shown at the bottom of every page — the Strava-affiliation disclaimer
// (required reading given how central the Strava API is to this app) plus
// pricing and the two legal pages, kept as one small link row rather than
// spreading them across the header where they'd compete with actual
// navigation.
export default function SiteFooter() {
  return (
    <footer className="foot">
      <span>Splitline — Built on Strava&rsquo;s API. Not affiliated with or endorsed by Strava.</span>
      <nav className="foot-links">
        <Link href="/pricing">Pricing</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
      </nav>
    </footer>
  );
}
