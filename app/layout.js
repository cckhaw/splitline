import "./globals.css";

export const metadata = {
  title: "Splitline — telemetry overlays for Strava",
  description: "Turn a Strava activity's own numbers into the overlay you post.",
};

// Sets the theme attribute before first paint so switching between light
// and dark doesn't flash the wrong palette. Falls back to dark (this
// app's original look) when nothing is stored yet or storage is blocked.
const THEME_INIT_SCRIPT = `(function(){try{
  var t = localStorage.getItem("splitline_theme");
  if (t !== "light" && t !== "dark") t = "dark";
  document.documentElement.setAttribute("data-theme", t);
}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

// suppressHydrationWarning on <html> below: the inline script sets
// data-theme on this element before React hydrates, on purpose (that's
// what avoids a light/dark flash) — which makes the attribute differ
// from the server-rendered markup, a mismatch React would otherwise flag.
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
