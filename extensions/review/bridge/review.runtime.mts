/**
 * Reviews on the bridge, loaded on attach: the site's review messages and the review's step labels.
 *
 * The site writes `decide` and `track` through `belay review` before sending them, so they persist with no session
 * attached; the message only tells a live session. The rest ask the session to act.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sessionDir } from "../../../bridge/files.mts";
import type { Runtime } from "../../../bridge/kind.mts";
import { Note, Slug, SLUG, type Channel } from "../../../bridge/protocol.mts";
import { parts, str } from "../../../bridge/transcript.mts";

export type ReviewState = { id: string };

const N = z.number().int().min(1).max(9999);
const ISSUE = /^[A-Z][A-Z0-9]*-\d+$/;

export const Messages = [
  z.object({ kind: z.literal("decide"), slug: Slug, n: z.array(N).min(1).max(500), decision: z.enum(["fix", "skip", "clear"]) }),
  z.object({ kind: z.literal("track"), slug: Slug, n: N, issue: z.string().regex(ISSUE).optional() }),
  z.object({ kind: z.literal("ask"), slug: Slug, n: N, question: Note.optional() }),
  z.object({ kind: z.literal("investigate"), slug: Slug, n: N }),
  z.object({ kind: z.literal("tests"), slug: Slug, n: N }),
  z.object({ kind: z.literal("apply"), slug: Slug }),
  z.object({ kind: z.literal("rerun"), slug: Slug }),
  z.object({ kind: z.literal("stop"), slug: Slug }),
] as const;
export type ReviewMessage = z.infer<(typeof Messages)[number]>;

const nums = (n: number[]) => n.map((i) => `#${i}`).join(", ");

function format(m: ReviewMessage, head: string, meta: Record<string, string>): Channel | undefined {
  switch (m.kind) {
    case "decide": {
      meta.n = m.n.join(" ");
      meta.decision = m.decision;
      const did = m.decision === "clear" ? `cleared the decision on ${nums(m.n)}` : `queued ${m.decision} for ${nums(m.n)}`;
      return { content: `${head}: ${did}. Already saved; nothing to run until they apply.`, meta };
    }
    case "track":
      meta.n = String(m.n);
      if (m.issue) meta.issue = m.issue;
      return { content: `${head}: tracked #${m.n}${m.issue ? ` as ${m.issue}` : ""}. Already saved.`, meta };
    case "ask":
      meta.n = String(m.n);
      return { content: `${head}: ask #${m.n}.${m.question ? `\n\n${m.question}` : ""}`, meta };
    case "investigate":
    case "tests":
      meta.n = String(m.n);
      return { content: `${head}: ${m.kind} #${m.n}.`, meta };
    case "apply":
      return { content: `${head}: apply the queued fixes.`, meta };
    case "rerun":
      return { content: `${head}: re-run the review.`, meta };
    case "stop":
      return { content: `${head}: stop the review.`, meta };
  }
}

const SAVE = /\bsave\.mjs"?\s+(init|progress|finish|stop)\b/;
const SAVED: Record<string, string> = {
  init: "Started the review",
  progress: "Saved progress",
  finish: "Saved the findings",
  stop: "Stopped the review",
};
const OUTCOME = /\bbelay review outcome\s+\S+\s+([\d\s]+?)\s+(applied|manual)\b/;

export const runtime: Runtime<ReviewState> = {
  messages: Messages,
  exclusive: false,
  format: format as Runtime["format"],
  target: ({ id }) => {
    if (typeof id !== "string" || !SLUG.test(id)) return "id must be lowercase letters, digits and dashes";
    return existsSync(path.join(sessionDir("reviews", id), "review.json")) ? { id } : `no review ${id}: run save.mjs init first`;
  },
  same: (state, target) => state.id === target.id,
  slug: (target) => target.id,
  head: (id) => ({ head: `Belay site, review \`${id}\``, meta: {} }),
  stepLabel(name, input) {
    if (name !== "Bash") return undefined;
    const cmd = str(input.command);
    const save = SAVE.exec(cmd);
    if (save) return parts(SAVED[save[1]]);
    const outcome = OUTCOME.exec(cmd);
    if (outcome) return parts(outcome[2] === "applied" ? "Recorded fixes for" : "Recorded follow-up for", nums(outcome[1].trim().split(/\s+/).map(Number)));
    return undefined;
  },
};
