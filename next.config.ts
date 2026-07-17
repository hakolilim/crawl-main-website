import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep playwright as a native Node require (not bundled by Turbopack/webpack).
  // Required for local chromium.launch() on the Node.js server runtime.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
