/** Grills on the bridge, loaded on attach: the answer and comment messages, `show`, and the mock's step labels. */
import { z } from "zod";
import { text, type Runtime } from "../../../bridge/kind.mts";
import { Images, Note, Slug, SLUG, type Channel } from "../../../bridge/protocol.mts";
import { norm, parts, str } from "../../../bridge/transcript.mts";

export type GrillState = { slug: string };

const Q = z.number().int().min(1).max(999);
const Opt = z.string().regex(/^[A-Za-z0-9-]{1,16}$/);

export const Messages = [
  z.object({ kind: z.literal("answer"), slug: Slug, q: Q, opt: Opt, note: Note.optional() }),
  z.object({
    kind: z.literal("comment"),
    slug: Slug,
    q: Q,
    opt: Opt,
    selector: z.string().min(1).max(1000),
    text: z.string().max(2000),
    note: Note,
    images: Images,
  }),
] as const;
export type GrillMessage = z.infer<(typeof Messages)[number]>;

export type GrillEvent = { type: "show"; q: number; opt?: string };

const Show = z.object({ q: Q, opt: Opt.optional() });

function format(m: GrillMessage, head: string, meta: Record<string, string>): Channel | undefined {
  switch (m.kind) {
    case "answer":
      Object.assign(meta, { q: String(m.q), opt: m.opt });
      return {
        content: `${head}: picked option ${m.opt} for Q${m.q}.${m.note ? `\n\nNote with the pick:\n\n${m.note}` : ""}`,
        meta,
      };
    case "comment": {
      Object.assign(meta, { q: String(m.q), opt: m.opt, selector: m.selector });
      const quoted = m.text.trim() ? ` ("${m.text.trim().replace(/\s+/g, " ")}")` : "";
      return {
        content: `${head}: comment on Q${m.q} option ${m.opt}, element \`${m.selector}\`${quoted}:\n\n${m.note}`,
        meta,
      };
    }
  }
}

/** Edits to the session's preview files update the mock, by the Q marker in the edit if any. */
function mockLabel(name: string, input: Record<string, unknown>, dir: string) {
  const file = norm(str(input.file_path));
  const d = `${norm(dir)}/`;
  if (!["Edit", "Write", "MultiEdit"].includes(name) || !file.startsWith(`${d}preview.`) || file.slice(d.length).includes("/")) {
    return undefined;
  }
  const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
  const texts = [input.old_string, input.new_string, input.content, ...edits.flatMap((e) => [e?.old_string, e?.new_string])];
  const q = texts.map((t) => /\bQ(\d+)\b/.exec(str(t))?.[1]).find(Boolean);
  return parts(q ? `Updated the Q${q} mock` : "Updated the mock");
}

export const runtime: Runtime<GrillState> = {
  messages: Messages,
  exclusive: false,
  format: format as Runtime["format"],
  target: ({ slug }) => (typeof slug === "string" && SLUG.test(slug) ? { slug } : "slug must be lowercase letters, digits and dashes"),
  same: (state, target) => state.slug === target.slug,
  slug: (target) => target.slug,
  head: (slug) => ({ head: `Belay site, grill \`${slug}\``, meta: {} }),
  call(name, args, { broadcast }) {
    if (name !== "show") return undefined;
    const parsed = Show.safeParse(args);
    if (!parsed.success) return text("expected {q: question number, opt?: option key}", true);
    broadcast({ type: "show", ...parsed.data });
    return text("shown");
  },
  stepLabel(name, input, dir) {
    if (name === "mcp__plugin_belay_belay__show") {
      const opt = str(input.opt);
      return parts("Pointed to", `Q${input.q}${opt ? ` · ${opt}` : ""}`);
    }
    return mockLabel(name, input, dir);
  },
};
