/**
 * A grill's full session.json (plugin/references/session-format.md) and the view logic the session
 * page needs from it. `decisions` and `context` mirror plugin/scripts/session.js, which the skill and
 * check-preview.js use, so a mock renders the same on the site as in the check.
 */
import type { QuestionStatus } from "./sessions.ts";

export type Patch = Record<string, unknown>;

export type Opt = {
  key: string;
  name: string;
  expl?: string;
  from?: string;
  yours?: boolean;
  current?: boolean;
  out?: boolean;
  patch?: Patch;
};

type QuestionMock = {
  controls?: string[];
  starts?: Record<string, unknown>;
  fixed?: Record<string, unknown>;
  requires?: Patch;
  screen?: "shell" | "page";
};

export type Question = {
  n: number;
  title: string;
  short?: string;
  status: QuestionStatus;
  see?: number;
  rec?: string | null;
  pick?: string | null;
  answer?: string | null;
  note?: string;
  opts?: Opt[];
  mock?: QuestionMock | null;
};

type MockSettings = {
  page: "existing" | "new";
  floor: number;
  screen: "shell" | "page";
  currentControls?: string[];
  appCss?: boolean;
  data?: boolean;
  fonts?: string[];
};

export type SessionDoc = {
  slug: string;
  topic: string;
  about?: string;
  status: string;
  project?: string;
  started?: string;
  updated?: string;
  open?: string;
  mock: MockSettings | null;
  questions: Question[];
};

/** What the stage shows: the grill's status card, the page before the session, every pick combined, or one question. */
export type View = { kind: "overview" } | { kind: "today" } | { kind: "current" } | { kind: "q"; n: number };

/** A view whose stage draws the mock. */
export type StageView = Exclude<View, { kind: "overview" }>;

/** The option shown for a question; `BEFORE` is the question's region without its own patch. */
export const BEFORE = "before";

const picked = (q: Question) => q.status === "resolved" && q.pick != null;
const patchOf = (q: Question | undefined, key: string) => q?.opts?.find((o) => o.key === key)?.patch ?? {};

/** Decision values for a view; for a question, `opt` is the option shown (`BEFORE` for none). */
export function decisions(doc: SessionDoc, base: Patch, view: StageView, opt: string = BEFORE): Patch {
  const d = { ...base };
  if (view.kind === "today") return d;
  const n = view.kind === "q" ? view.n : null;
  for (const q of doc.questions) if (picked(q) && q.n !== n) Object.assign(d, patchOf(q, q.pick!));
  if (n == null) return d;
  const q = doc.questions.find((x) => x.n === n);
  Object.assign(d, q?.mock?.requires ?? {});
  if (opt !== BEFORE) Object.assign(d, patchOf(q, opt));
  return d;
}

type Control = { label: string; items: [unknown, string][]; def: unknown };
export type Controls = Record<string, Control>;

/** Control values: defaults, the question's starts, the user's choices, then its fixed context. */
export function context(
  controls: Controls,
  q: Question | null,
  chosen: Record<string, unknown>,
  phone: boolean,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(controls)) ctx[k] = c.def;
  Object.assign(ctx, q?.mock?.starts ?? {}, chosen, q?.mock?.fixed ?? {});
  return { ...ctx, phone, q: q?.n ?? null };
}

/** The controls a view's bar offers, limited to keys the spec defines. */
export function viewControls(doc: SessionDoc, view: StageView, controls: Controls): string[] {
  const keys = view.kind === "q" ? doc.questions.find((q) => q.n === view.n)?.mock?.controls : doc.mock?.currentControls;
  return (keys ?? []).filter((k) => k in controls);
}

/** The option a question opens on: the pick, else the recommendation, else the first option. */
export function defaultOpt(q: Question): string {
  const keys = new Set(q.opts?.map((o) => o.key));
  if (q.pick && keys.has(q.pick)) return q.pick;
  if (q.rec && keys.has(q.rec)) return q.rec;
  return q.opts?.[0]?.key ?? BEFORE;
}

/** The root a variant (an option with `from`) iterates on; an option without `from` is its own root. */
function rootOf(q: Question, key: string): string {
  const byKey = new Map(q.opts?.map((o) => [o.key, o]));
  let r = key;
  for (let i = 0; i < 20; i++) {
    const from = byKey.get(r)?.from;
    if (!from || !byKey.has(from)) break;
    r = from;
  }
  return r;
}

/** Options grouped as root + its variants, roots in display order. */
export function families(q: Question): { root: Opt; kids: Opt[] }[] {
  const opts = q.opts ?? [];
  return opts
    .filter((o) => rootOf(q, o.key) === o.key)
    .map((root) => ({ root, kids: opts.filter((o) => o.key !== root.key && rootOf(q, o.key) === root.key) }));
}

export type StatusChip = { text: string; tone: "picked" | "open" | "deferred" | "dropped" | "see"; see?: number };

export function statusChip(q: Question): StatusChip {
  if (picked(q)) {
    const name = q.opts?.find((o) => o.key === q.pick)?.name;
    return { text: `✓ ${q.pick}${name ? ` · ${name}` : ""}`, tone: "picked" };
  }
  if (q.status === "resolved") return { text: "✓ answered", tone: "picked" };
  if (q.status === "deferred" || q.status === "dropped") return { text: q.status, tone: q.status };
  if (q.status === "see") return { text: q.see ? `↪ see Q${q.see}` : "↪ see", tone: "see", see: q.see };
  return { text: "open", tone: "open" };
}

/**
 * Where the page opens: Overview for a settled grill; in progress, the newest open question, else Current design
 * when there's a mock, else the last question.
 */
export function initialView(doc: SessionDoc): View {
  if (doc.status !== "in-progress") return { kind: "overview" };
  const open = [...doc.questions].reverse().find((q) => q.status === "open");
  if (open) return { kind: "q", n: open.n };
  if (doc.mock) return { kind: "current" };
  const last = doc.questions.at(-1);
  return last ? { kind: "q", n: last.n } : { kind: "current" };
}

export type DecidedSeg = "done" | "open" | "deferred";

/** Resolved questions out of every question but dropped and see ones, with a segment per counted question. */
export function decidedCount(doc: SessionDoc): { decided: number; total: number; segs: DecidedSeg[] } {
  const segs: DecidedSeg[] = doc.questions
    .filter((q) => q.status !== "dropped" && q.status !== "see")
    .map((q) => (q.status === "resolved" ? "done" : q.status === "deferred" ? "deferred" : "open"));
  return { decided: segs.filter((s) => s === "done").length, total: segs.length, segs };
}

export const viewHash = (v: View) => (v.kind === "q" ? `#q-${v.n}` : `#${v.kind}`);

/** The view a location hash names, or null when it names none this session has. */
export function parseViewHash(hash: string, doc: SessionDoc): View | null {
  const h = hash.replace(/^#/, "");
  if (h === "overview") return { kind: "overview" };
  if (h === "current") return { kind: "current" };
  if (h === "today") return doc.mock?.page === "existing" ? { kind: "today" } : null;
  const m = /^q-(\d+)$/.exec(h);
  if (m && doc.questions.some((q) => q.n === Number(m[1]))) return { kind: "q", n: Number(m[1]) };
  return null;
}
