// Enables "Add to Home Screen" on mobile browsers with the Splitline
// logo as the installed icon — Next.js serves this at /manifest.webmanifest
// and links it automatically, no metadata.manifest wiring needed.
export default function manifest() {
  return {
    name: "Splitline",
    short_name: "Splitline",
    description: "Turn a Strava activity's own numbers into the overlay you post.",
    start_url: "/",
    display: "standalone",
    background_color: "#EAF6FC",
    theme_color: "#FD6130",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
