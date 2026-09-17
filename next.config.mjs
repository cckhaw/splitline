/** @type {import('next').NextConfig} */
const nextConfig = {
  // @resvg/resvg-js ships a native (napi) binary — keep it out of the
  // serverless bundle and let Node require() it directly at runtime.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Don't auto-generate AGENTS.md/CLAUDE.md on every build.
  agentRules: false,
};

export default nextConfig;
