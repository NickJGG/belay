import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The repo root, so `../src/*.ts` (the CLI's store and ops) resolves and is traced into the build.
const root = fileURLToPath(new URL('..', import.meta.url));

const config: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  devIndicators: { position: 'bottom-right' },
};

export default config;
