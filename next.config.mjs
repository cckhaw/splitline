/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Next.js inlines small bootstrap scripts, so script-src needs
// 'unsafe-inline' (a nonce-based CSP would force every page dynamic).
// Everything else is locked to self plus the few third parties the app
// actually uses. Dev needs 'unsafe-eval' for React's debugging tools.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // @resvg/resvg-js ships a native (napi) binary, and satori's harfbuzzjs
  // dependency loads a WASM file by relative path at import time — both
  // break if webpack/Turbopack try to bundle and relocate them (the WASM
  // path resolves to a nonexistent "/ROOT/..." path once bundled). Keep
  // both external so Node just require()s them from node_modules as-is.
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
  // Don't auto-generate AGENTS.md/CLAUDE.md on every build.
  agentRules: false,
  // The bundled .ttf files under assets/fonts/ are read at runtime via
  // fs (lib/renderPng.js), not imported, so Vercel's build-time file
  // tracer won't discover them on its own — without this they'd be
  // missing from the deployed function and every exported PNG would
  // render with invisible text (Vercel's serverless runtime has no
  // system fonts to fall back to).
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
