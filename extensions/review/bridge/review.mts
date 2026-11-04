/** Reviews (`/review:review`) on the bridge: the descriptor, loaded at startup. The runtime is review.runtime.mts. */
// No `progress` tool: save.mjs writes the stage progress to review.json, which the site watches.
import type { Kind } from "../../../bridge/kind.mts";
import type { ReviewState } from "./review.runtime.mts";

export const kind: Kind<ReviewState> = {
  id: "review",
  noun: "review",
  plural: "reviews",
  skill: "/review:review",
  folder: "reviews",
  key: "id",
  properties: { id: { type: "string", description: "A review's id, e.g. review-20261104-1405-last-commit" } },
  attach: "a review by `id` (the /review:review skill, when a review starts or resumes)",
  resume: "to run `/review:review resume <id>` (a review)",
  instructions: `\
Reviews (/review:review; finding numbers \`n\` are findings.json's):
- kind="decide" (\`n\`, \`decision\` fix|skip|clear) and kind="track" (\`n\`, maybe \`issue\`): already saved by the site. Acknowledge in one line; don't run anything.
- kind="ask" (\`n\`, maybe \`question\`), "investigate" or "tests" (\`n\`): run that command from the skill's actions.md for finding n.
- kind="apply": apply the queued fixes, as the skill's Resume does. kind="rerun": run the review again. kind="stop": stop the running review (save.mjs stop) and say what finished.`,
  tools: ["reply", "choice", "detach"],
  reattach: (id) => `disconnected: run \`/review:review resume ${id}\` in the terminal`,
  page: (id) => `/r/${id}`,
  load: async () => (await import("./review.runtime.mts")).runtime,
};
