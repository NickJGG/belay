/**
 * Claude's activity, read from its transcript (`~/.claude/projects/<cwd slug>/<sessionId>.jsonl`), for the drawer's
 * step groups. Messages still come from chat.jsonl.
 *
 *   turn starts  a user prompt: terminal text, a slash command, or a `<channel>` site message (a meta record)
 *   steps        assistant `tool_use` blocks, labelled by `stepLabel`; Belay's own plumbing reads as session actions
 *   results      `tool_result` blocks, matched by tool_use id: a failure's reason, a search's or edit's count, a
 *                finished agent, a background launch that a later `<task-notification>` finishes
 *   turn ends    system/turn_duration, or an "[Request interrupted by user" user text
 * Sidechain and compact-summary records are dropped; unknown records and blocks are skipped, never thrown.
 */
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";

type Block = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
};
export type Record_ = {
  type?: string;
  subtype?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  message?: { content?: string | Block[] };
  toolUseResult?: unknown;
  permissionMode?: string;
};

/** A step's parts: `verb` as plain text, `target` as a chip, then `detail`; `label` joins them. */
export type StepParts = { label: string; verb: string; target?: string; detail?: string };
export type Tone = "bad" | "warn";
/** `id` is the tool_use id; `meta` (a failure reason, a duration, a count) follows the row, red or amber by `tone`. */
export type Step = { label: string; at: string; verb?: string; target?: string; detail?: string; id?: string; meta?: string; tone?: Tone };
export type TurnEvent =
  | { type: "busy"; on: boolean }
  | ({ type: "step" } & Step)
  | { type: "result"; id: string; meta: string; tone?: Tone }
  | { type: "turn"; start: string; steps: Step[]; ms: number; interrupted?: true };

type Pending = { step: Step; name: string; input: Record<string, unknown>; at: string; hidden: boolean };
type Background = StepParts & { at: string };

const sizeOf = (file: string) => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};

/** Reads whole lines appended to `file` since the last read; a partial last line waits for the next. */
export class Tail {
  readonly file: string;
  private offset: number;

  constructor(file: string, from = sizeOf(file)) {
    this.file = file;
    this.offset = from;
  }

  read(): Record_[] {
    const size = sizeOf(this.file);
    if (size < this.offset) this.offset = 0;
    if (size === this.offset) return [];
    const buf = Buffer.alloc(size - this.offset);
    let fd: number;
    try {
      fd = openSync(this.file, "r");
    } catch {
      return [];
    }
    try {
      readSync(fd, buf, 0, buf.length, this.offset);
    } finally {
      closeSync(fd);
    }
    const end = buf.lastIndexOf(0x0a);
    if (end < 0) return [];
    this.offset += end + 1;
    const out: Record_[] = [];
    for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r && typeof r === "object") out.push(r);
      } catch {}
    }
    return out;
  }
}

/** The last `permissionMode` recorded in `file`, for a tail that starts at its end. */
export function lastMode(file: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  let mode: string | undefined;
  for (const m of text.matchAll(/"permissionMode"\s*:\s*"([^"]*)"/g)) mode = m[1];
  return mode;
}

const HIDDEN_USER = /^\s*<(task-notification|local-command-stdout|local-command-caveat|bash-stdout|bash-stderr)\b/;
const INTERRUPTED = /^\[Request interrupted by user/;
const NOTIFICATION = /^\s*<task-notification\b/;
/** Commands whose exit 1 means "nothing matched", not a failure. */
const NO_MATCH = new Set(["grep", "rg", "diff", "test", "["]);

/** `dir`: the session folder, whose session.json and preview files read as session actions. */
export type LabelContext = { dir: string };

/**
 * Folds transcript records into busy/step/result/turn events for one Belay session. A tool_result updates its
 * call's step in place (`result`); a finished agent or background command adds a step of its own.
 */
export class Turns {
  busy = false;
  start = "";
  steps: Step[] = [];
  /** The permission mode last recorded in the transcript (undocumented `permission-mode` entries and `permissionMode` fields). */
  mode?: string;
  private ctx: LabelContext;
  /** This turn's calls awaiting a result, hidden ones included so their failures can surface. */
  private pending = new Map<string, Pending>();
  /** Background tasks by task id (Bash `backgroundTaskId`, an async agent's `agentId`); they finish in a later turn. */
  private background = new Map<string, Background>();

  constructor(ctx: LabelContext) {
    this.ctx = ctx;
  }

  /** A turn already under way, e.g. the one that called `attach`. */
  begin(at: string): TurnEvent[] {
    if (this.busy) return [];
    this.busy = true;
    this.start = at;
    return [{ type: "busy", on: true }];
  }

  push(r: Record_): TurnEvent[] {
    if (r.isSidechain || r.isCompactSummary) return [];
    if (typeof r.permissionMode === "string") this.mode = r.permissionMode;
    const at = r.timestamp ?? new Date().toISOString();
    if (r.type === "system") return r.subtype === "turn_duration" ? this.end(at) : [];
    if (r.type === "user") return this.user(r, at);
    if (r.type !== "assistant") return [];
    const out = this.begin(at);
    const content = r.message?.content;
    if (!Array.isArray(content)) return out;
    for (const b of content) {
      if (b.type !== "tool_use" || !b.name) continue;
      const input = b.input ?? {};
      const parts = stepLabel(b.name, input, this.ctx);
      const step: Step = { ...(parts ?? hiddenLabel(b.name)), at, ...(b.id ? { id: b.id } : {}) };
      if (b.id) this.pending.set(b.id, { step, name: b.name, input, at, hidden: !parts });
      if (!parts) continue;
      this.steps.push(step);
      out.push({ type: "step", ...step });
    }
    return out;
  }

  /** The open turn, ended as interrupted (a detach, /clear or exit mid-turn). */
  flush(at = new Date().toISOString()): TurnEvent[] {
    return this.end(at, true);
  }

  private user(r: Record_, at: string): TurnEvent[] {
    let content = r.message?.content;
    const out: TurnEvent[] = [];
    if (Array.isArray(content)) {
      for (const b of content) if (b.type === "tool_result") out.push(...this.result(b, r.toolUseResult, at));
      content = content
        .map((b) => (b.type === "text" ? (b.text ?? "") : b.type === "image" ? "[image]" : ""))
        .join("\n")
        .trim();
    }
    if (typeof content !== "string" || !content) return out;
    if (INTERRUPTED.test(content)) return [...out, ...this.end(at, true)];
    if (NOTIFICATION.test(content)) return [...out, ...this.notified(content, at)];
    // Site messages arrive as meta records; skill bodies, caveats and reminders are meta too.
    if (!content.includes("<channel") && (r.isMeta || HIDDEN_USER.test(content))) return out;
    if (/<command-name>\/clear<\/command-name>/.test(content)) return out;
    return [...out, ...this.begin(at)];
  }

  private result(b: Block, toolUseResult: unknown, at: string): TurnEvent[] {
    const p = b.tool_use_id ? this.pending.get(b.tool_use_id) : undefined;
    if (!p) return [];
    this.pending.delete(b.tool_use_id!);
    if (b.is_error) {
      const why = reason(textOf(b.content));
      if (why === "interrupted") return this.mark(p, { meta: why, tone: "warn" });
      if (why === "exit 1" && p.name === "Bash" && NO_MATCH.has(p.step.target ?? "")) return this.mark(p, { meta: "no matches", tone: "warn" });
      return this.mark(p, { meta: why, tone: "bad" });
    }
    // An approved plan leaves plan mode, possibly with no `permission-mode` entry before the next prompt.
    if (p.name === "ExitPlanMode") this.mode = undefined;
    const res = (toolUseResult && typeof toolUseResult === "object" ? toolUseResult : {}) as Record<string, unknown>;
    if (p.name === "Agent" || p.name === "Task") {
      const desc = str(p.input.description);
      const done = parts(desc ? "Agent finished:" : "Agent finished", undefined, desc ? lower(desc) : undefined);
      if (res.status === "async_launched" || res.isAsync === true) {
        if (typeof res.agentId === "string") this.background.set(res.agentId, { ...done, at: p.at });
        return [];
      }
      const ms = typeof res.totalDurationMs === "number" ? res.totalDurationMs : Date.parse(at) - Date.parse(p.at);
      return this.add({ ...done, at, meta: clock(ms) });
    }
    if (p.name === "Bash") {
      if (!p.hidden && typeof res.backgroundTaskId === "string") {
        this.background.set(res.backgroundTaskId, { ...parts("Command finished", p.step.target), at: p.at });
      }
      return [];
    }
    // Belay's friendly steps (Saved the session, Updated the mock) have no target and get no count.
    const n = p.hidden || !p.step.target ? undefined : count(p.name, res);
    return n ? this.mark(p, n) : [];
  }

  /** A `<task-notification>`: a background task launched in an earlier call has finished. */
  private notified(text: string, at: string): TurnEvent[] {
    const id = /<task-id>\s*([^<\s]+)\s*<\/task-id>/.exec(text)?.[1];
    const bg = id ? this.background.get(id) : undefined;
    if (!bg) return [];
    this.background.delete(id!);
    const status = /<status>\s*(\w+)/.exec(text)?.[1];
    const { at: launched, ...rest } = bg;
    return this.add({ ...rest, at, meta: clock(Date.parse(at) - Date.parse(launched)), ...(status === "failed" || status === "killed" ? { tone: "bad" as const } : {}) });
  }

  /** Records a call's outcome on its step; a hidden call that failed shows up now. */
  private mark(p: Pending, m: { meta: string; tone?: Tone }): TurnEvent[] {
    Object.assign(p.step, m);
    if (p.hidden) return m.tone === "bad" ? this.add(p.step) : [];
    return p.step.id ? [{ type: "result", id: p.step.id, ...m }] : [];
  }

  private add(step: Step): TurnEvent[] {
    const out = this.begin(step.at);
    this.steps.push(step);
    out.push({ type: "step", ...step });
    return out;
  }

  private end(at: string, interrupted = false): TurnEvent[] {
    if (!this.busy) return [];
    if (interrupted) for (const p of this.pending.values()) if (!p.hidden && !p.step.meta) Object.assign(p.step, { meta: "interrupted", tone: "warn" });
    this.pending.clear();
    const ms = Math.max(0, Date.parse(at) - Date.parse(this.start)) || 0;
    const turn: TurnEvent = { type: "turn", start: this.start, steps: this.steps, ms, ...(interrupted ? { interrupted: true } : {}) };
    this.busy = false;
    this.start = "";
    this.steps = [];
    return [turn, { type: "busy", on: false }];
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const short = (p: string) => p.replace(/\\/g, "/").split("/").slice(-2).join("/");
/** Hidden tools, with the row each would show if it failed. */
const HIDDEN_TOOLS = new Map([
  ["mcp__plugin_belay_belay__reply", "Sent a reply"],
  ["mcp__plugin_belay_belay__choice", "Posted a choice"],
  ["mcp__plugin_belay_belay__attach", "Attached the session"],
  ["mcp__plugin_belay_belay__detach", "Detached the session"],
  ["ToolSearch", "Loaded tools"],
  ["TodoWrite", "Updated the todo list"],
]);

/** A hidden call's row; the only hidden Bash is log-chat. */
const hiddenLabel = (name: string) => parts(HIDDEN_TOOLS.get(name) ?? (name === "Bash" ? "Logged the chat" : `Used ${name}`));

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((b) => (b && typeof b === "object" && typeof b.text === "string" ? b.text : "")).join("\n")
      : "";

/** A failed tool_result's short reason. */
const reason = (text: string) => {
  const exit = /^\s*Exit code (\d+)/.exec(text);
  if (exit) return `exit ${exit[1]}`;
  if (/interrupted by user/i.test(text)) return "interrupted";
  if (/\bhook\b/i.test(text)) return "blocked by hook";
  if (/doesn't want to proceed|was rejected|\bdenied\b/i.test(text)) return "denied";
  if (/has not been read/i.test(text)) return "not read yet";
  if (/not found|does not exist|no such file/i.test(text)) return "not found";
  return "failed";
};

const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A search's count; finding nothing reads amber. */
const found = (n: number | undefined, one: string, many?: string) =>
  n === undefined ? undefined : { meta: plural(n, one, many), ...(n === 0 ? { tone: "warn" as const } : {}) };

/**
 * A successful call's count, read from its `toolUseResult`; undefined for tools without one and for any shape
 * not recognised. Grep and Glob prefer their totals (`totalFiles`, `totalLines`, `totalMatches`) over the
 * head-limited `num*` fields.
 */
const count = (name: string, res: Record<string, unknown>): { meta: string; tone?: Tone } | undefined => {
  switch (name) {
    case "Grep":
      if (res.mode === "content") return found(num(res.totalLines) ?? num(res.numLines), "line");
      if (res.mode === "count") return found(num(res.numMatches), "match", "matches");
      return found(num(res.totalFiles) ?? num(res.numFiles), "file");
    case "Glob": {
      if (res.truncated !== true) return found(num(res.numFiles), "file");
      const total = res.countIsComplete === true ? num(res.totalMatches) : undefined;
      if (total !== undefined) return found(total, "file");
      const shown = num(res.numFiles);
      return shown === undefined ? undefined : { meta: `${shown}+ files` };
    }
    case "Edit":
    case "MultiEdit":
    case "Write": {
      if (res.type === "create" && typeof res.content === "string") {
        return { meta: `+${res.content ? res.content.split("\n").length - (res.content.endsWith("\n") ? 1 : 0) : 0}` };
      }
      if (!Array.isArray(res.structuredPatch)) return undefined;
      let add = 0;
      let del = 0;
      for (const hunk of res.structuredPatch) {
        const lines: unknown = hunk && typeof hunk === "object" ? (hunk as Record<string, unknown>).lines : undefined;
        if (!Array.isArray(lines)) return undefined;
        for (const l of lines) {
          if (typeof l !== "string") continue;
          if (l.startsWith("+")) add++;
          else if (l.startsWith("-")) del++;
        }
      }
      return add || del ? { meta: `+${add} −${del}` } : undefined;
    }
    case "WebSearch": {
      // `results` mixes `{tool_use_id, content: [hits]}` blocks with Claude's text commentary.
      if (!Array.isArray(res.results)) return undefined;
      const hits = res.results.reduce<number>((n, r) => n + (r && typeof r === "object" && Array.isArray(r.content) ? r.content.length : 0), 0);
      return found(hits, "result");
    }
  }
  return undefined;
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)) || 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Splits a shell command into its simple commands, dropping `cd`s and heredoc bodies (log-chat reads one). */
const commands = (cmd: string) =>
  cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2[ \t]*(?=\n|$)/g, " $3")
    .split(/&&|\|\||[;|\n]/)
    .map((c) => c.trim())
    .filter((c) => c && !/^cd(\s|$)/.test(c));

/** Lowercases a sentence's first word, unless it is an acronym or a name with an inner capital (CSS, PowerShell). */
export const lower = (s: string) => {
  const word = /^\S*/.exec(s)![0];
  return /[A-Z]/.test(word.slice(1)) ? s : s.charAt(0).toLowerCase() + s.slice(1);
};

const parts = (verb: string, target?: string, detail?: string): StepParts => ({
  label: [verb, target, detail].filter(Boolean).join(" "),
  verb,
  ...(target ? { target } : {}),
  ...(detail ? { detail } : {}),
});

const to = (description: string) => (description ? `to ${lower(description)}` : undefined);

/** The drawer's row for a tool call, or null to hide it. */
export function stepLabel(name: string, input: Record<string, unknown>, ctx: LabelContext): StepParts | null {
  if (HIDDEN_TOOLS.has(name)) return null;
  const filePath = str(input.file_path || input.notebook_path);
  const file = filePath && short(filePath);

  if (filePath && ["Edit", "Write", "MultiEdit"].includes(name)) {
    const p = norm(filePath);
    const dir = `${norm(ctx.dir)}/`;
    if (p === `${dir}session.json`) return parts("Saved the session");
    if (p.startsWith(`${dir}preview.`) && !p.slice(dir.length).includes("/")) {
      const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
      const texts = [input.old_string, input.new_string, input.content, ...edits.flatMap((e) => [e?.old_string, e?.new_string])];
      const q = texts.map((t) => /\bQ(\d+)\b/.exec(str(t))?.[1]).find(Boolean);
      return parts(q ? `Updated the Q${q} mock` : "Updated the mock");
    }
  }

  switch (name) {
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return parts("Edited", file);
    case "Write":
      return parts("Wrote", file);
    case "Read":
      return parts("Read", file);
    case "Bash": {
      const cmd = str(input.command);
      if (cmd.includes("check-preview.js")) return parts("Checked the mock");
      if (cmd.includes("render-md.js")) return parts("Saved the session");
      const all = commands(cmd);
      const real = all.filter((c) => !c.includes("log-chat.js"));
      if (all.length && !real.length) return null;
      const first = (real[0] ?? cmd).split(/\s+/)[0];
      return first ? parts("Ran", first, to(str(input.description))) : parts("Ran a command", undefined, to(str(input.description)));
    }
    case "Glob":
    case "Grep":
      return parts("Searched", str(input.pattern));
    case "Skill":
      return input.skill ? parts("Loaded", str(input.skill)) : parts("Loaded a skill");
    case "Agent":
    case "Task":
      return parts("Started an agent", undefined, to(str(input.description)));
    case "Workflow":
      return parts("Started a workflow");
    case "WebSearch":
      return parts("Searched the web for", str(input.query));
    case "WebFetch":
      return parts("Fetched", str(input.url));
    case "mcp__plugin_belay_belay__show": {
      const opt = str(input.opt);
      return parts("Pointed to", `Q${input.q}${opt ? ` · ${opt}` : ""}`);
    }
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? parts("Used", mcp[2], `in ${mcp[1]}`) : parts("Used", name);
}
