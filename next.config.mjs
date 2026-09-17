/** @type {import('next').NextConfig} */
const nextConfig = {
  // @resvg/resvg-js ships a native (napi) binary — keep it out of the
  // serverless bundle and let Node require() it directly at runtime.
  serverExternalPackages: ["@resvg/resvg-js"],
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
