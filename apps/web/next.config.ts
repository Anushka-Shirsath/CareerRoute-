import type { NextConfig } from "next";
const backend = (process.env.API_ORIGIN || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
// On Vercel the rewrite target is fixed at build time. Without this check a
// missing variable would quietly point the live site at localhost.
if (process.env.VERCEL && !/^https:\/\/[^/]+$/.test(backend))
  throw new Error(
    "Set API_ORIGIN to the API project's https URL (no path) in this Vercel project's environment variables, then redeploy.",
  );
const config: NextConfig = {
  poweredByHeader: false,
  // The mentor can take up to 110 seconds when the AI provider asks it to wait.
  experimental: { proxyTimeout: 120_000 },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
        { source: "/api-health", destination: `${backend}/health` },
      ],
    };
  },
};
export default config;
