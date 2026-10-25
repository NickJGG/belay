import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The repo root, so `../src/*.ts` (the CLI's store and ops) resolves and is traced into the build.
const root = fileURLToPath(new URL("..", import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  // Opened at 127.0.0.1 (the bridge's allowed origin); Next's dev server only trusts localhost.
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
