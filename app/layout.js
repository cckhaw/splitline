import "./globals.css";

export const metadata = {
  title: "Splitline — telemetry overlays for Strava",
  description: "Turn a Strava activity's own numbers into the overlay you post.",
};

// Sets the theme attribute and font-size scale before first paint so
// neither flashes its default before switching to the stored value.
// Falls back to light / 1.15x when nothing is stored yet or storage is
// blocked. The font-size bounds here are duplicated from lib/fontSize.js
// (a plain <script> can't import a module) — keep the two in sync.
const THEME_INIT_SCRIPT = `(function(){
  try{
    var t = localStorage.getItem("splitline_theme");
    if (t !== "light" && t !== "dark") t = "light";
    document.documentElement.setAttribute("data-theme", t);
  }catch(e){document.documentElement.setAttribute("data-theme","light");}
  try{
    var s = parseFloat(localStorage.getItem("splitline_font_scale"));
    if (!isFinite(s) || s < 0.8 || s > 1.4) s = 1.15;
    document.documentElement.style.setProperty("--fs-scale", s);
  }catch(e){}
})();`;

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
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
