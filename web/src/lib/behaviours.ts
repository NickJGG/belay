/**
 * The session page's Q13 behaviours that don't need a DOM: which option a key press selects, the rail order
 * `[` `]` step through, follow along's jump-or-pill rule, and the per-session state kept in localStorage.
 */
import { families, viewHash, type Question, type SessionDoc, type View } from "./session-doc.ts";

/**
 * The option a letter key selects: that letter's option, or, when it's already showing (or one of its
 * variants is), the next one in its family (a → a1 → a2 → a).
 */
export function optForKey(q: Question, letter: string, current: string): string | null {
  const fam = families(q).find((f) => f.root.key.toLowerCase() === letter);
  if (!fam) return null;
  const keys = [fam.root.key, ...fam.kids.map((k) => k.key)];
  const i = keys.indexOf(current);
  return i === -1 ? keys[0] : keys[(i + 1) % keys.length];
}

/** Views in rail order: Current design, Today, then the questions. */
export function viewOrder(doc: SessionDoc): View[] {
  const out: View[] = [];
  if (doc.mock) out.push({ kind: "current" });
  if (doc.mock?.page === "existing") out.push({ kind: "today" });
  for (const q of doc.questions) out.push({ kind: "q", n: q.n });
  return out;
}

/** The view one step before (-1) or after (1) `view` in rail order, stopping at the ends. */
export function stepView(doc: SessionDoc, view: View, dir: -1 | 1): View | null {
  const order = viewOrder(doc);
  const i = order.findIndex((v) => viewHash(v) === viewHash(view));
  return order[i === -1 ? 0 : i + dir] ?? null;
}

/**
 * Follow along: a `show` from Claude moves the page when the user is still where follow along last put
 * them (or where the page opened); anywhere else, it only offers a pill.
 */
export function followAction(here: string, lastFollowed: string, target: string): "here" | "jump" | "pill" {
  if (here === target) return "here";
  return here === lastFollowed ? "jump" : "pill";
}

export type ViewState = { opt?: string; ctl: Record<string, unknown>; vs?: string };

/** What a session page remembers between visits (Q13 f). The view itself lives in the URL hash. */
export type Remembered = {
  states: Record<string, ViewState>;
  device: "desktop" | "phone";
  compare: boolean;
  drawerOpen: boolean;
  drawerW: number;
  split: number;
};

export const REMEMBERED_DEFAULTS: Remembered = { states: {}, device: "desktop", compare: false, drawerOpen: true, drawerW: 460, split: 0.5 };

export const rememberKey = (slug: string) => `sear:session:${slug}`;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A stored entry, field by field: anything missing or malformed falls back to its default. */
export function parseRemembered(raw: string | null): Remembered {
  const d = REMEMBERED_DEFAULTS;
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  if (!isObj(v)) return { ...d, states: {} };
  const states: Record<string, ViewState> = {};
  if (isObj(v.states)) {
    for (const [k, s] of Object.entries(v.states)) {
      if (!/^#(current|today|q-\d+)$/.test(k) || !isObj(s)) continue;
      states[k] = {
        ...(typeof s.opt === "string" ? { opt: s.opt } : {}),
        ...(typeof s.vs === "string" ? { vs: s.vs } : {}),
        ctl: isObj(s.ctl) ? s.ctl : {},
      };
    }
  }
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    states,
    device: v.device === "phone" ? "phone" : "desktop",
    compare: typeof v.compare === "boolean" ? v.compare : d.compare,
    drawerOpen: typeof v.drawerOpen === "boolean" ? v.drawerOpen : d.drawerOpen,
    drawerW: clamp(num(v.drawerW) ?? d.drawerW, 320, 760),
    split: clamp(num(v.split) ?? d.split, 0.15, 0.85),
  };
}
