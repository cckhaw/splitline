/** @type {import('next').NextConfig} */
const nextConfig = {
  // @resvg/resvg-js ships a native (napi) binary — keep it out of the
  // serverless bundle and let Node require() it directly at runtime.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
