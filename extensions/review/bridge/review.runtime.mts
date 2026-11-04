/** Reviews on the bridge, loaded on attach. */
import type { Runtime } from "../../../bridge/kind.mts";
import { SLUG } from "../../../bridge/protocol.mts";

export type ReviewState = { id: string };

export const runtime: Runtime<ReviewState> = {
  messages: [],
  exclusive: false,
  format: () => undefined,
  target: ({ id }) => (typeof id === "string" && SLUG.test(id) ? { id } : "id must be lowercase letters, digits and dashes"),
  same: (state, target) => state.id === target.id,
  slug: (target) => target.id,
  head: (id) => ({ head: `Belay site, review \`${id}\``, meta: {} }),
};
