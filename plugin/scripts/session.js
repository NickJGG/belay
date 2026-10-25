/** Reading and checking a session folder's session.json (format: references/session-format.md). */
import fs from "node:fs";
import path from "node:path";

const STATUSES = ["in-progress", "planned", "abandoned"];
const Q_STATUSES = ["open", "resolved", "deferred", "dropped", "see"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z]\d*$/;
const MOCK_FIELDS = ["controls", "starts", "fixed", "requires", "screen"];

export function readSession(dir) {
  const file = path.join(dir, "session.json");
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`session.json: ${err.message}`);
  }
}

/** Every problem with a parsed session, as human-readable strings; empty when it's valid. */
export function validate(s, dir) {
  const p = [];
  const str = (v) => typeof v === "string" && v.trim() !== "";
  if (!str(s.slug)) p.push("slug: missing");
  else if (dir && path.basename(dir) !== s.slug) p.push(`slug: "${s.slug}" doesn't match the folder name`);
  if (!str(s.topic)) p.push("topic: missing");
  if (!STATUSES.includes(s.status)) p.push(`status: must be one of ${STATUSES.join(" | ")}`);
  for (const k of ["started", "updated"]) if (!DATE.test(s[k] ?? "")) p.push(`${k}: must be YYYY-MM-DD`);
  if ("project" in s && !str(s.project)) p.push("project: leave it out rather than empty");
  if (typeof s.open !== "string") p.push("open: must be a string");
  if (!Array.isArray(s.questions)) return [...p, "questions: must be an array"];

  const ns = new Set();
  s.questions.forEach((q, i) => {
    const at = `questions[${i}]${Number.isInteger(q?.n) ? ` (Q${q.n})` : ""}`;
    if (!Number.isInteger(q?.n) || q.n < 1) return p.push(`${at}: n must be a positive integer`);
    if (ns.has(q.n)) p.push(`${at}: duplicate n`);
    ns.add(q.n);
    if (!str(q.title)) p.push(`${at}: title missing`);
    if (!Q_STATUSES.includes(q.status)) p.push(`${at}: status must be one of ${Q_STATUSES.join(" | ")}`);
    if (q.status === "see" && !Number.isInteger(q.see)) p.push(`${at}: status "see" needs see: <n>`);
    if (q.status !== "open" && !str(q.answer)) p.push(`${at}: ${q.status} but no answer digest`);
    const opts = q.opts ?? [];
    if (!Array.isArray(opts)) return p.push(`${at}: opts must be an array`);
    const keys = new Set();
    for (const o of opts) {
      if (!KEY.test(o?.key ?? "")) p.push(`${at}: option key "${o?.key}" must be a letter plus optional number`);
      else if (keys.has(o.key)) p.push(`${at}: duplicate option ${o.key}`);
      keys.add(o?.key);
      if (!str(o?.name)) p.push(`${at}: option ${o?.key} has no name`);
      if (o?.from !== undefined && !opts.some((x) => x.key === o.from)) p.push(`${at}: option ${o.key} is from unknown ${o.from}`);
      if (q.mock && (typeof o?.patch !== "object" || o.patch === null)) p.push(`${at}: mocked, but option ${o?.key} has no patch`);
    }
    for (const [field, v] of [["rec", q.rec], ["pick", q.pick]]) {
      if (v != null && !keys.has(v)) p.push(`${at}: ${field} "${v}" isn't one of its options`);
    }
    if (q.status === "resolved" && opts.length && q.pick == null) p.push(`${at}: resolved with options but no pick`);
    if (q.status === "open" && q.pick != null) p.push(`${at}: open but has a pick`);
    if (q.mock) {
      if (!s.mock) p.push(`${at}: has a mock but the session's mock settings are null`);
      for (const k of Object.keys(q.mock)) if (!MOCK_FIELDS.includes(k)) p.push(`${at}: unknown mock field ${k}`);
    }
  });
  for (const q of s.questions) {
    if (q?.status === "see" && Number.isInteger(q.see) && !ns.has(q.see)) p.push(`Q${q.n}: see Q${q.see}, which doesn't exist`);
  }
  if (s.mock) {
    if (!["existing", "new"].includes(s.mock.page)) p.push('mock.page: must be "existing" or "new"');
    if (!Number.isInteger(s.mock.floor)) p.push("mock.floor: must be an integer (px)");
    if (!["shell", "page"].includes(s.mock.screen)) p.push('mock.screen: must be "shell" or "page"');
  }
  return p;
}

const picked = (q) => q.status === "resolved" && q.pick != null;
const patchOf = (q, key) => q.opts?.find((o) => o.key === key)?.patch ?? {};

/**
 * Decision values for one view: Today (`{today: true}`), Current design (`{}`), or question `n`'s option `opt`
 * (`opt: null` is its Before).
 */
export function decisions(s, base, { today = false, n = null, opt = null } = {}) {
  const d = { ...base };
  if (today) return d;
  for (const q of s.questions) if (picked(q) && q.n !== n) Object.assign(d, patchOf(q, q.pick));
  if (n == null) return d;
  const q = s.questions.find((x) => x.n === n);
  Object.assign(d, q?.mock?.requires ?? {});
  if (opt != null) Object.assign(d, patchOf(q, opt));
  return d;
}

/** Control values for a view: defaults, then the question's starts, then its fixed context. */
export function context(controls, q, { phone = false } = {}) {
  const ctx = {};
  for (const [k, c] of Object.entries(controls ?? {})) ctx[k] = c.def;
  Object.assign(ctx, q?.mock?.starts ?? {}, q?.mock?.fixed ?? {});
  return { ...ctx, phone, q: q?.n ?? null };
}
