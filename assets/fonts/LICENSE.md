These font files are used by `lib/renderPng.js` to rasterize the app's
SVG cards (activity overlays, insight exports) to PNG server-side,
without depending on the deployment environment having any fonts of its
own installed — see the README, "Exporting the prediction and injury
panels as social images".

- **Space Grotesk** — designed by Florian Karsten, licensed under the
  SIL Open Font License 1.1.
- **IBM Plex Mono** — designed by IBM, licensed under the SIL Open Font
  License 1.1.

Both are the same families already loaded from Google Fonts in
`app/layout.js` for the app's own UI. Full license text:
<https://openfontlicense.org>.
