/** @type {import('next').NextConfig} */
const nextConfig = {
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
