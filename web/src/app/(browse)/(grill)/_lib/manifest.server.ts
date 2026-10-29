import { grillsDir } from "../../../../../../src/config.ts";
import type { ServerKind } from "../../../../lib/session-kind.ts";

/** Grills claim the live sessions no other kind reads, as every session was a grill before lessons. */
export const server = {
  id: "grill",
  root: grillsDir,
  fallback: true,
  load: async () => (await import("./runtime.server.ts")).runtime,
} satisfies ServerKind;
