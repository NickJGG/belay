/** A session's chat.jsonl (format: plugin/references/session-format.md) and which of its prompts still take an answer. */

export type ChatEntry = { at: string; from: "site" | "claude" | "terminal"; kind: string } & Record<string, unknown>;

const FROM = new Set(["site", "claude", "terminal"]);

/** One entry per valid line; a torn last line (mid-append) or junk is skipped. */
export function parseChat(text: string): ChatEntry[] {
  const out: ChatEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && FROM.has(e.from) && typeof e.kind === "string") out.push({ ...e, at: String(e.at ?? "") });
    } catch {}
  }
  return out;
}

/**
 * Claude's own turn moving on (a message, or the user typing in the terminal) retires any earlier prompt. A
 * `steps` entry doesn't: the bridge writes it when the turn that posted the prompt ends.
 */
const movesOn = (e: ChatEntry) => (e.from === "claude" && e.kind !== "permission" && e.kind !== "steps") || e.from === "terminal";

/**
 * Choice ids and permission request ids that can still be answered from the site: not answered from the
 * site, and nothing has happened since that means the terminal moved past them (typing in the terminal
 * dismisses a choice; a permission prompt answered there leaves no entry, but Claude's next message follows it).
 */
export function openPrompts(entries: ChatEntry[]): { choices: Set<string>; permissions: Set<string> } {
  const choices = new Set<string>();
  const permissions = new Set<string>();
  for (const e of entries) {
    if (e.from === "claude" && e.kind === "choice") {
      choices.clear();
      permissions.clear();
      choices.add(String(e.id));
      continue;
    }
    if (e.from === "claude" && e.kind === "permission") {
      permissions.add(String(e.request_id));
      continue;
    }
    if (e.from === "site" && e.kind === "choice") choices.delete(String(e.id));
    else if (e.from === "site" && e.kind === "permission") permissions.delete(String(e.request_id));
    else if (movesOn(e)) {
      choices.clear();
      permissions.clear();
    }
  }
  return { choices, permissions };
}

export const PLAN_READY = /^Plan ready\b/i;

export type Tone = "bad" | "warn";

/**
 * One tool step of Claude's turn, as the bridge labels it from the transcript: `verb`, a `target` chip, then
 * `detail`, and `meta` after the row (red or amber by `tone`). `id` is the tool call's. Old entries carry only `label`.
 */
export type Step = { label: string; at: string; verb?: string; target?: string; detail?: string; id?: string; meta?: string; tone?: Tone };

const PARTS = ["verb", "target", "detail", "id", "meta"] as const;

const toTone = (v: unknown): Tone | undefined => (v === "bad" || v === "warn" ? v : undefined);

/** A step from the bridge or chat.jsonl, keeping only its known string fields. */
export function toStep(raw: unknown): Step {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const step: Step = { label: String(r.label ?? ""), at: String(r.at ?? "") };
  for (const k of PARTS) if (typeof r[k] === "string" && r[k]) step[k] = r[k];
  const tone = toTone(r.tone);
  if (tone) step.tone = tone;
  return step;
}

/** The turn in progress: when it started and its steps so far. */
export type OpenTurn = { start: string; steps: Step[] };

/** The open turn with a bridge `result` event (`{id, meta, tone?}`) applied to its step; unchanged if none matches. */
export function applyResult(turn: OpenTurn, e: Record<string, unknown>): OpenTurn {
  if (typeof e.id !== "string" || typeof e.meta !== "string" || !turn.steps.some((s) => s.id === e.id)) return turn;
  const tone = toTone(e.tone);
  const steps = turn.steps.map((s) => {
    if (s.id !== e.id) return s;
    const next: Step = { ...s, meta: e.meta as string };
    if (tone) next.tone = tone;
    else delete next.tone;
    return next;
  });
  return { ...turn, steps };
}

/**
 * A `steps` entry (`from: "claude"`: `{start, steps, ms, interrupted?}`) is written at turn end, after the
 * turn's own messages. Each moves up to sit before the first earlier Claude message of its turn (a reply,
 * terminal message or choice at or after `start`), or stays put when the turn had none.
 */
export function placeSteps(chat: ChatEntry[]): ChatEntry[] {
  const before = new Map<number, ChatEntry[]>();
  const moved = new Set<number>();
  chat.forEach((e, i) => {
    if (e.from !== "claude" || e.kind !== "steps") return;
    const start = Date.parse(String(e.start));
    const j = chat.findIndex(
      (x, k) => k < i && x.from === "claude" && (x.kind === "reply" || x.kind === "terminal" || x.kind === "choice") && Date.parse(x.at) >= start,
    );
    if (j < 0) return;
    before.set(j, [...(before.get(j) ?? []), e]);
    moved.add(i);
  });
  return chat.flatMap((e, i) => (moved.has(i) ? [] : [...(before.get(i) ?? []), e]));
}

const MCP = /^mcp__(?:plugin_[^_]+_)?(.+?)__(.+)$/;

/** A tool's display name: an MCP tool reads `server · tool` (a plugin's prefix dropped), a built-in as-is. */
export function toolLabel(name: string): { label: string; server?: string; tool: string } {
  const m = MCP.exec(name);
  return m ? { label: `${m[1]} · ${m[2]}`, server: m[1], tool: m[2] } : { label: name, tool: name };
}

const BELAY_TOOL_LINES: Record<string, string> = {
  reply: "Post a message to this drawer.",
  choice: "Post a choice to this drawer as buttons.",
  show: "Point the page at a question.",
  attach: "Attach this terminal session to Belay.",
  detach: "Detach this terminal session from Belay.",
};

const belayTool = (name: string) => {
  const t = toolLabel(name);
  return t.server === "belay" && Object.hasOwn(BELAY_TOOL_LINES, t.tool) ? t.tool : undefined;
};

/** A permission card's description: ours for Belay's tools, none for other MCP tools (their docs address Claude), Claude Code's for built-ins. */
export function permissionLine(name: string, description: string): string {
  const own = belayTool(name);
  if (own) return BELAY_TOOL_LINES[own];
  return toolLabel(name).server ? "" : description;
}

export type PermView =
  | { kind: "markdown"; text: string; options?: string[] }
  | { kind: "command"; command: string; description?: string }
  | { kind: "edit"; path: string; oldText: string; newText: string }
  | { kind: "fields"; fields: [string, string][] }
  | { kind: "raw"; text: string };

const isStr = (v: unknown): v is string => typeof v === "string";

/** How a permission card shows the tool's `input_preview` (Claude Code's JSON of its input); `raw` when it isn't a JSON object. */
export function permView(name: string, raw: string): PermView {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { kind: "raw", text: raw };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return { kind: "raw", text: raw };
  const o = input as Record<string, unknown>;
  const own = belayTool(name);
  if (own === "reply" && isStr(o.text)) return { kind: "markdown", text: o.text };
  if (own === "choice" && isStr(o.prompt) && Array.isArray(o.options) && o.options.every(isStr)) return { kind: "markdown", text: o.prompt, options: o.options };
  if ((name === "Bash" || name === "PowerShell") && isStr(o.command)) {
    return { kind: "command", command: o.command, ...(isStr(o.description) ? { description: o.description } : {}) };
  }
  if (name === "Edit" && isStr(o.file_path) && isStr(o.old_string) && isStr(o.new_string)) {
    return { kind: "edit", path: o.file_path, oldText: o.old_string, newText: o.new_string };
  }
  return { kind: "fields", fields: Object.entries(o).map(([k, v]) => [k, isStr(v) ? v : JSON.stringify(v)]) };
}
