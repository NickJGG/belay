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
  // The on-by-default dev cache grew to 9 GB on disk and ~7 GB of RAM held by every `belay serve --dev`.
  experimental: { turbopackFileSystemCacheForDev: false },
};

export default nextConfig;
