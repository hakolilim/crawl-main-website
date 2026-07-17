import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep playwright-core as a native Node require (not bundled by Turbopack/webpack).
  // Required for Browserless remote connect on Vercel serverless.
  serverExternalPackages: ["playwright-core"],

  // File tracing often omits non-JS assets like browsers.json, which playwright-core
  // loads at package init even when only using chromium.connect() to Browserless.
  outputFileTracingIncludes: {
    "/api/hako/login": ["./node_modules/playwright-core/**/*"],
    "/api/hako/fetch-novel": ["./node_modules/playwright-core/**/*"],
    "/api/hako/fetch-chapter": ["./node_modules/playwright-core/**/*"],
  },
};

export default nextConfig;
