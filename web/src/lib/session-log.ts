import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { root } from "./courses.ts";
import { resolveWikiTarget } from "./wiki-target.ts";
import type { Routine } from "./routines.ts";

/*
 * Claude Code session logs (`~/.claude/projects/<cwd slug>/<sessionId>.jsonl`): the only module
 * that knows their format. One JSON record per line; a conversation is the non-sidechain
 * `user`/`assistant` records, each assistant content block in a record of its own.
 *   site turns      user records (isMeta) holding <channel source="topo" …>text</channel>,
 *                   answered by `mcp__topo__reply` tool calls
 *   terminal turns  plain user strings / slash commands, answered by assistant text blocks
 *   tools           tool_use blocks, shown as one-liners; results and thinking are hidden
 *   focus           an `mcp__topo__show` call, once its result comes back without an error, or a
 *                   now.md write (the whiteboard): what the site's follow-along keeps on screen
 *   turn ends      system/turn_duration, or an "[Request interrupted…" user text
 * Assistant text after a `reply` in the same turn is hidden: Claude Code forces visible terminal
 * output at the end of every turn ("Your previous response had no visible output…"), so a site
 * turn always ends in a terminal line that only restates the reply.
 * Unknown record and block types are skipped, never thrown.
 */

export type Surface = "site" | "terminal";

export type ChatItem =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      surface: Surface;
      text: string;
      quote?: string;
      at: string;
      course?: string;
    }
  | { kind: "tool"; id: string; label: string; at: string }
  | { kind: "board"; id: string; course: string; at: string }
  | { kind: "show"; id: string; at: string; course: string; target: FocusTarget; label: string; href: string };

export type FocusTarget = "claim" | "whiteboard" | "work" | "source";
/** What Claude is pointing at; `id` is the item that set it. */
export type Focus = { id: string; target: FocusTarget; course: string; href: string; label: string };

export type SessionState = {
  sessionId: string;
  title: string | null;
  /** The first thing the learner said, cut to a line. */
  opening: string | null;
  /** The course the session last touched (by file path or `/learn <course>`). */
  course: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** A turn is under way: a prompt arrived and no turn end has followed. */
  busy: boolean;
  /** tool_use blocks still waiting for their tool_result. */
  pendingTools: number;
  messages: number;
  /** Course-relative files the session's tools wrote, as `<course>/<rel>`. */
  wrote: string[];
  /** The last Handhold routine started (typed or via the Skill tool); `closed` once its log.md is written. */
  routine: { kind: Routine; course: string; closed: boolean } | null;
  focus: Focus | null;
};

const REPLY_TOOL = "mcp__topo__reply";
const SHOW_TOOL = "mcp__topo__show";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const CHANNEL = /<channel\s+([^>]*)>\n?([\s\S]*?)\n?<\/channel>/g;
const ATTR = /([\w-]+)="([^"]*)"/g;
const HIDDEN_USER = /^\s*<(task-notification|local-command-stdout|local-command-caveat|bash-stdout|bash-stderr)\b/;

type Block = { type?: string; text?: string; name?: string; id?: string; input?: Record<string, unknown> };
type Record_ = {
  type?: string;
  subtype?: string;
  uuid?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  aiTitle?: string;
  message?: { content?: string | Block[] };
};

/** Folds log lines into chat items. Items are append-only, so callers can page by index. */
export class SessionParser {
  readonly items: ChatItem[] = [];
  readonly state: SessionState;
  private open = new Set<string>();
  /** `show` calls by tool_use id, waiting for their result. */
  private shows = new Map<string, Extract<ChatItem, { kind: "show" }>>();
  private wrote = new Set<string>();
  private replied = false;
  private learningRoot: string;

  constructor(sessionId: string, learningRoot = root()) {
    this.state = {
      sessionId,
      title: null,
      opening: null,
      course: null,
      startedAt: null,
      endedAt: null,
      busy: false,
      pendingTools: 0,
      messages: 0,
      wrote: [],
      routine: null,
      focus: null,
    };
    this.learningRoot = path.resolve(learningRoot).replace(/\\/g, "/").toLowerCase();
  }

  push(line: string) {
    let r: Record_;
    try {
      r = JSON.parse(line);
    } catch {
      return;
    }
    if (!r || typeof r !== "object") return;
    if (r.type === "ai-title" && typeof r.aiTitle === "string") this.state.title = r.aiTitle;
    if (r.isSidechain || r.isCompactSummary) return;
    const at = r.timestamp ?? "";
    if (r.type === "system") {
      if (r.subtype === "turn_duration") this.endTurn();
      return;
    }
    if (r.type !== "user" && r.type !== "assistant") return;
    if (at) {
      this.state.startedAt ??= at;
      this.state.endedAt = at;
    }
    const content = r.message?.content;
    const id = r.uuid ?? `${at}-${this.items.length}`;
    if (r.type === "user") this.user(id, at, content, !!r.isMeta);
    else if (Array.isArray(content)) content.forEach((b, i) => this.assistant(`${id}:${i}`, at, b));
  }

  private add(item: ChatItem) {
    this.items.push(item);
    if (item.kind !== "message") return;
    this.state.messages++;
    if (item.role === "user" && !this.state.opening) this.state.opening = item.text.split("\n")[0].slice(0, 120);
  }

  private endTurn() {
    this.state.busy = false;
    this.replied = false;
    this.open.clear();
    this.shows.clear();
    this.state.pendingTools = 0;
  }

  private setFocus(item: Extract<ChatItem, { kind: "show" }>) {
    const { id, target, course, href, label } = item;
    this.state.focus = { id, target, course, href, label };
  }

  private user(id: string, at: string, content: string | Block[] | undefined, meta: boolean) {
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type === "tool_result") {
          const { tool_use_id = "", is_error } = b as { tool_use_id?: string; is_error?: boolean };
          this.open.delete(tool_use_id);
          this.state.pendingTools = this.open.size;
          const show = this.shows.get(tool_use_id);
          this.shows.delete(tool_use_id);
          if (show && !is_error) {
            this.add({ ...show, at: at || show.at });
            this.setFocus(show);
          }
        }
      }
      const text = content
        .map((b) => (b.type === "text" ? (b.text ?? "") : b.type === "image" ? "[image]" : ""))
        .join("\n")
        .trim();
      if (!text) return;
      content = text;
    }
    if (typeof content !== "string") return;

    if (content.includes("<channel")) {
      let n = 0;
      for (const m of content.matchAll(CHANNEL)) {
        const attrs = Object.fromEntries([...m[1].matchAll(ATTR)].map((a) => [a[1], a[2]]));
        const { quote, text } = splitQuote(m[2]);
        this.add({
          kind: "message",
          id: `${id}:${n++}`,
          role: "user",
          surface: "site",
          text,
          quote,
          at,
          course: attrs.course,
        });
      }
      if (n) {
        this.state.busy = true;
        this.replied = false;
        return;
      }
    }
    // Skill bodies, caveats and reminders are injected as meta user turns.
    if (meta || HIDDEN_USER.test(content)) return;
    if (/^\[Request interrupted by user/.test(content)) {
      this.endTurn();
      return;
    }
    const text = slashCommand(content) ?? stripReminders(content);
    if (!text || text === "/clear") return;
    const learn = /^\/learn(?::(\S+))?\s+([a-z0-9][a-z0-9-]*)(.*)/i.exec(text);
    if (learn) this.learn(learn[1], learn[2], learn[3]);
    this.state.busy = true;
    this.replied = false;
    this.add({ kind: "message", id, role: "user", surface: "terminal", text, at });
  }

  private assistant(id: string, at: string, b: Block) {
    this.state.busy = true;
    if (b.type === "text") {
      const text = b.text?.trim();
      if (text && !this.replied) this.add({ kind: "message", id, role: "assistant", surface: "terminal", text, at });
      return;
    }
    if (b.type !== "tool_use" || !b.name) return;
    if (b.id) {
      this.open.add(b.id);
      this.state.pendingTools = this.open.size;
    }
    const input = b.input ?? {};
    if (b.name === REPLY_TOOL) {
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (text) this.add({ kind: "message", id, role: "assistant", surface: "site", text, at });
      this.replied = true;
      return;
    }
    if (b.name === SHOW_TOOL) {
      const show = this.show(id, at, input);
      if (show && b.id) this.shows.set(b.id, show);
      return;
    }
    const file = this.courseFile(input.file_path ?? input.notebook_path ?? input.path);
    if (file) this.state.course = file.course;
    if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(b.name) && file) {
      this.wrote.add(`${file.course}/${file.rel}`);
      this.state.wrote = [...this.wrote];
      if (file.rel === "log.md") this.closeRoutine(file.course);
      if (file.rel === "now.md") {
        this.add({ kind: "board", id, course: file.course, at });
        this.setFocus(whiteboard(id, at, file.course));
        return;
      }
    }
    if (b.name === "Bash" && typeof input.command === "string") {
      const touched = this.courseFile(/Learning[\\/][^\s"']+/i.exec(input.command)?.[0]);
      if (touched) this.state.course = touched.course;
      // Only writes: sessions also `cat` the log while they run.
      const r = this.state.routine;
      const appends = /(?:>>?|\btee\b(?:\s+-a)?)\s*["']?[^\s"'|;&>]*log\.md\b/.test(input.command);
      if (r && appends && new RegExp(String.raw`(?:^|[\s"'/\\])${r.course}(?:[\\/\s"']|$)`, "i").test(input.command)) {
        this.closeRoutine(r.course);
      }
    }
    if (b.name === "Skill" && typeof input.skill === "string") {
      const skill = /^learn(?::(\w+))?$/.exec(input.skill);
      const args = /^\s*([a-z0-9][a-z0-9-]*)(.*)/i.exec(str(input.args));
      if (skill && args) this.learn(skill[1], args[1], args[2]);
    }
    const label = toolLabel(b.name, input, file?.rel);
    if (label) this.add({ kind: "tool", id, label, at });
  }

  /** `/learn[:sub] <course> <rest>`: the course it touches and the routine it starts, if any. */
  private learn(sub: string | undefined, course: string, rest: string) {
    if (!fs.existsSync(path.join(this.learningRoot, course, "course.md"))) return;
    this.state.course = course;
    const kind: Routine | null = !sub
      ? /--quick\b/.test(rest) ? "quick" : "lesson"
      : sub === "review" || sub === "checkpoint" ? sub : null;
    if (kind) this.state.routine = { kind, course, closed: false };
  }

  /** A `show` call's item, or null if its input can't name a page. */
  private show(id: string, at: string, input: Record<string, unknown>): Extract<ChatItem, { kind: "show" }> | null {
    const course = str(input.course);
    if (!SLUG.test(course)) return null;
    const base = { kind: "show" as const, id, at, course };
    switch (input.target) {
      case "claim": {
        const topic = str(input.topic);
        const cid = str(input.id);
        if (!SLUG.test(topic) || !/^c\d+$/.test(cid)) return null;
        const href = resolveWikiTarget(course, `knowledge/${topic}#^${cid}`);
        return { ...base, target: "claim", label: `${topic} · ${cid}`, href };
      }
      case "source": {
        const sid = str(input.id);
        if (!SLUG.test(sid)) return null;
        return { ...base, target: "source", label: sid, href: resolveWikiTarget(course, `sources/${sid}`) };
      }
      case "whiteboard":
        return whiteboard(id, at, course);
      case "work": {
        const p = str(input.path);
        const abs = this.courseFile(p);
        const rel = abs ? (abs.course === course ? abs.rel : "") : p.replace(/\\/g, "/").replace(/^\.\//, "");
        const parts = rel.split("/");
        if (parts[0] !== "work" || parts.length < 2 || parts.some((s) => !s || s === "." || s === "..")) return null;
        const href = `/courses/${course}/work/${parts.slice(1).map(encodeURIComponent).join("/")}`;
        return { ...base, target: "work", label: rel, href };
      }
    }
    return null;
  }

  // A new object: summaries hold shallow copies of the state.
  private closeRoutine(course: string) {
    const r = this.state.routine;
    if (r && r.course === course && !r.closed) this.state.routine = { ...r, closed: true };
  }

  /** `{course, rel}` for a path inside a course folder under the Learning root. */
  private courseFile(p: unknown): { course: string; rel: string } | null {
    if (typeof p !== "string" || !p) return null;
    const norm = p.replace(/\\/g, "/");
    const lower = norm.toLowerCase();
    let rest: string | null = null;
    if (lower.startsWith(this.learningRoot + "/")) rest = norm.slice(this.learningRoot.length + 1);
    else {
      const m = /(?:^|\/)learning\/(.+)$/i.exec(norm);
      if (m) rest = m[1];
    }
    if (!rest) return null;
    const [course, ...parts] = rest.split("/");
    if (!course || course.startsWith(".") || !parts.length) return null;
    return { course, rel: parts.join("/") };
  }
}

function whiteboard(id: string, at: string, course: string): Extract<ChatItem, { kind: "show" }> {
  const href = resolveWikiTarget(course, "now");
  return { kind: "show", id, at, course, target: "whiteboard", label: "the whiteboard", href };
}

/** Leading "> " lines are a passage the learner highlighted. */
function splitQuote(body: string): { quote?: string; text: string } {
  const m = /^((?:>[^\n]*(?:\n|$))+)\n*/.exec(body);
  if (!m) return { text: body.trim() };
  const quote = m[1].replace(/^> ?/gm, "").trim();
  return { quote: quote || undefined, text: body.slice(m[0].length).trim() };
}

function slashCommand(text: string): string | null {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1].trim();
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1].trim();
  return args ? `${name} ${args}` : name;
}

function stripReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
}

const short = (p: string) => p.replace(/\\/g, "/").split("/").slice(-2).join("/");
const str = (v: unknown) => (typeof v === "string" ? v : "");

function toolLabel(name: string, input: Record<string, unknown>, rel?: string): string | null {
  const file = rel ?? (str(input.file_path || input.notebook_path) && short(str(input.file_path || input.notebook_path)));
  switch (name) {
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `Edited ${file}`;
    case "Write":
      return `Wrote ${file}`;
    case "Read":
      return `Read ${file}`;
    case "Bash": {
      const cmd = str(input.command);
      const script = /\b(cards|courses|fsrs)\.js\b/.exec(cmd)?.[0];
      if (script) return `Ran ${script}`;
      return `Ran ${str(input.description) || cmd.split(/\s+/)[0] || "a command"}`;
    }
    case "Glob":
    case "Grep":
      return `Searched ${str(input.pattern)}`;
    case "Skill":
      return `Loaded ${str(input.skill) || "a skill"}`;
    case "Agent":
    case "Task":
      return `Started an agent${input.description ? `: ${str(input.description)}` : ""}`;
    case "Workflow":
      return "Started a workflow";
    case "WebSearch":
      return `Searched the web: ${str(input.query)}`;
    case "WebFetch":
      return `Fetched ${str(input.url)}`;
    case "ToolSearch":
    case "TodoWrite":
      return null;
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? `Used ${mcp[2]} (${mcp[1]})` : `Used ${name}`;
}

// --- files -------------------------------------------------------------------

const PROJECTS = path.join(os.homedir(), ".claude", "projects");
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Claude Code names a cwd's log folder by replacing every non-alphanumeric character with "-". */
const slugDir = (cwd: string) => path.join(PROJECTS, cwd.replace(/[^a-zA-Z0-9]/g, "-"));

/** Where `topo` sessions log: they are launched from the Learning root. */
export const liveLogDir = () => slugDir(root());

/**
 * Log folders whose sessions may be Handhold ones: the Learning root's (every session), and the
 * home folder's, where earlier `/learn` sessions ran (only those that invoked `/learn`).
 */
const sources = () => [
  { dir: liveLogDir(), all: true },
  { dir: slugDir(os.homedir()), all: false },
];

type Cached = { size: number; offset: number; mtime: number; parser: SessionParser; used: number };
const g = globalThis as typeof globalThis & {
  __topoLogs?: Map<string, Cached>;
  __topoLogIndex?: Map<string, { size: number; mtime: number; summary: SessionState | null }>;
};
const cache = (g.__topoLogs ??= new Map());
const MAX_CACHED = 4;

function findFile(sessionId: string): string | null {
  if (!SESSION_ID.test(sessionId)) return null;
  for (const { dir } of sources()) {
    const file = path.join(dir, `${sessionId}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Parses `file` from where the last read stopped; a partial last line waits for the next read. */
function load(file: string, sessionId: string): SessionParser | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  let hit = cache.get(file);
  if (!hit || stat.size < hit.offset) {
    hit = { size: 0, offset: 0, mtime: 0, parser: new SessionParser(sessionId), used: 0 };
    cache.set(file, hit);
  }
  hit.used = Date.now();
  if (stat.size > hit.offset) {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(stat.size - hit.offset);
      fs.readSync(fd, buf, 0, buf.length, hit.offset);
      const end = buf.lastIndexOf(0x0a);
      if (end >= 0) {
        for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
          if (line.trim()) hit.parser.push(line);
        }
        hit.offset += end + 1;
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  hit.size = stat.size;
  hit.mtime = stat.mtimeMs;
  if (cache.size > MAX_CACHED) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].used - b[1].used)[0];
    if (oldest[0] !== file) cache.delete(oldest[0]);
  }
  return hit.parser;
}

export type SessionPage = { state: SessionState; items: ChatItem[]; total: number };

/** Items of a session from index `from` on, plus its current state. */
export function readSession(sessionId: string, from = 0): SessionPage | null {
  const file = findFile(sessionId);
  const parser = file && load(file, sessionId);
  if (!parser) return null;
  return {
    state: { ...parser.state },
    items: parser.items.slice(Math.max(0, from)),
    total: parser.items.length,
  };
}

/** The most recently written session in the live log folder (the last `topo` session). */
export function latestLiveSession(): string | null {
  let best: { id: string; mtime: number } | null = null;
  try {
    for (const name of fs.readdirSync(liveLogDir())) {
      const id = name.slice(0, -".jsonl".length);
      if (!name.endsWith(".jsonl") || !SESSION_ID.test(id)) continue;
      const mtime = fs.statSync(path.join(liveLogDir(), name)).mtimeMs;
      if (!best || mtime > best.mtime) best = { id, mtime };
    }
  } catch {}
  return best?.id ?? null;
}

/** Summaries of every Handhold session with at least one message, newest first. */
export function listSessions(): SessionState[] {
  const index = (g.__topoLogIndex ??= new Map());
  const out: SessionState[] = [];
  for (const { dir, all } of sources()) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const id = name.slice(0, -".jsonl".length);
      if (!name.endsWith(".jsonl") || !SESSION_ID.test(id)) continue;
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      let entry = index.get(file);
      if (!entry || entry.size !== stat.size || entry.mtime !== stat.mtimeMs) {
        entry = { size: stat.size, mtime: stat.mtimeMs, summary: summarise(file, id, all) };
        index.set(file, entry);
      }
      if (entry.summary?.messages) out.push(entry.summary);
    }
  }
  return out.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
}

/** A routine started from the site: a `kind="command"` channel message, JSON-escaped in the log. */
const SITE_COMMAND = /<channel [^>]*kind=\\"command\\"/;

function summarise(file: string, id: string, all: boolean): SessionState | null {
  const text = fs.readFileSync(file, "utf8");
  if (!all && !text.includes("<command-name>/learn") && !SITE_COMMAND.test(text)) return null;
  const parser = new SessionParser(id);
  for (const line of text.split("\n")) if (line.trim()) parser.push(line);
  return { ...parser.state };
}

/**
 * The session that wrote `<course>/<rel>`, else the one whose time span contains `at`.
 * Lesson pages use it to link to the conversation that made them.
 */
export function sessionFor(course: string, rel: string, at: Date | null): string | null {
  const sessions = listSessions();
  const key = `${course}/${rel}`;
  const writer = sessions.find((s) => s.wrote.includes(key));
  if (writer) return writer.sessionId;
  if (!at) return null;
  const t = at.toISOString();
  return sessions.find((s) => s.startedAt && s.endedAt && s.startedAt <= t && t <= s.endedAt)?.sessionId ?? null;
}
