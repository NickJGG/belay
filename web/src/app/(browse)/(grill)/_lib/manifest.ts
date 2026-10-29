import { PATH_PATTERNS } from "../../../../../../src/extension-ids.ts";
import type { PureKind } from "../../../../lib/session-kind.ts";

const session: PureKind = {
  tools: { show: "Point the page at a question." },
  reattach: (slug) => `Not attached: run \`/grill resume ${slug}\` in the terminal`,
};

export const manifest = { id: "grill", patterns: PATH_PATTERNS.grill, session } as const;
