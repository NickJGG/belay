import { lessonsDir } from "../../../../../../src/config.ts";
import type { ServerKind } from "../../../../lib/session-kind.ts";

/** Its runtime loads courses.ts, which loads the learn skill's scripts, so it waits until learn is first needed. */
export const server = {
  id: "learn",
  root: lessonsDir,
  load: async () => (await import("./runtime.server.ts")).runtime,
} satisfies ServerKind;
