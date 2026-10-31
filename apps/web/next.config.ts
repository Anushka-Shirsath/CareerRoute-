import type { NextConfig } from "next";
const backend = (process.env.API_ORIGIN || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
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
