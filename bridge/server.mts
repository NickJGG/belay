/*
 * Belay bridge: the `plugin:belay@belay` Claude Code channel, spawned over stdio by the belay plugin. It carries the
 * live sessions the Belay site shows, each of a session kind an extension registers (kinds/): grills (`/grill`) and
 * lessons (`/learn`).
 *
 * Idle it is MCP only, listing one tool, `attach`, which names a session by its kind's argument (a grill's `slug`, a
 * lesson's `course`). Attaching loads the rest (HTTP, zod, files, the kinds' runtimes), binds a free 127.0.0.1 port
 * with a fresh token, writes `bridge.json` in the session folder (`~/Belay/<kind folder>/<slug>`) for the site to
 * find, and announces the session's tools with tools/list_changed: `reply`, `choice` and `detach`, plus its kind's
 * own (`show`, and a lesson's `restart`). `detach` undoes all of it.
 *
 * The kinds that are active follow `settings.yaml` (settings.mts): INSTRUCTIONS as it was at startup, the tools as it
 * is on every request. An attached session keeps its kind's tools until it detaches.
 *
 * Site messages (http.mts, protocol.mts) become `<channel source="belay">` notifications; replies, choices,
 * permission prompts and Follow along targets go back as SSE. Both sides are appended to `chat.jsonl`.
 *
 * The attach locks onto the calling session: the id in `~/.claude/sessions/<parent pid>.json`, else the id the
 * skill passes, else the newest transcript. When that file's id changes (a `/clear`), or without it a newer
 * transcript appears in the same log folder, the site is told `disconnected` and nothing more is forwarded
 * until `attach` again. Only the fallback mistakes a second session in the same folder for a `/clear`.
 *
 * While attached it also tails that session's transcript (transcript.mts): busy state for every turn, terminal
 * ones included, and the turn's steps, streamed as `step` and appended to `chat.jsonl` as one `steps` entry.
 */
import { randomBytes } from "node:crypto";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { dataDir } from "./files.mts";
import type { BridgeEvent, BridgeHttp } from "./http.mts";
import { ALWAYS, text, type IdleContext, type Kind, type Runtime, type Tool } from "./kind.mts";
import { BUILT_IN, compose, GATED, KINDS, loadKinds, type Composed, type Message } from "./kinds/index.mts";
import { loadYaml, readEnabled } from "./settings.mts";
import type { Tail, TurnEvent, Turns } from "./transcript.mts";

const STARTED = Date.now();
const POLL = 2000;
const TAIL = 250;
const log = (...args: unknown[]) => console.error("[belay-bridge]", ...args);

let modules: ReturnType<typeof importAll> | null = null;
const importAll = async () => {
  const [files, protocol, http, transcript, focus, { z }] = await Promise.all([
    import("./files.mts"),
    import("./protocol.mts"),
    import("./http.mts"),
    import("./transcript.mts"),
    import("./focus.mts"),
    import("zod"),
  ]);
  return { files, protocol, http, transcript, focus, z };
};
const load = () =>
  (modules ??= importAll().then((m) => {
    loaded = m;
    return m;
  }));
type Modules = Awaited<ReturnType<typeof importAll>>;
// The exit handler is synchronous, so it needs the modules themselves, not the promise.
let loaded: Modules | null = null;

type Live = {
  slug: string;
  /** The session folder. */
  dir: string;
  kind: Kind;
  runtime: Runtime;
  /** The kind's own, from the attach arguments. */
  state: unknown;
  /** Every listed kind's messages and step labels, as of the attach. */
  kinds: Composed;
  token: string;
  http: BridgeHttp;
  sessionId: string | null;
  /** Tracking the owner process's session file; otherwise the newest transcript in `logDir`. */
  byOwner: boolean;
  logDir: string | null;
  lockedAt: number;
  connected: boolean;
  working: boolean;
  choices: ReturnType<Modules["protocol"]["createChoices"]>;
  permissions: Set<string>;
  poll: NodeJS.Timeout;
  tail: Tail | null;
  turns: Turns;
  tailTimer: NodeJS.Timeout;
};
let live: Live | null = null;

/** The kinds new sessions may attach as. */
const attachable = (): Kind[] => {
  const on = readEnabled(dataDir(), BUILT_IN);
  return KINDS.filter((k) => !GATED.has(k.id) || on[k.id]);
};
/** The kinds whose tools are known: the attachable ones and the attached session's. */
const listed = (): Kind[] => {
  const kinds = attachable();
  return KINDS.filter((k) => kinds.includes(k) || live?.kind === k);
};

function broadcast(e: BridgeEvent) {
  live?.http.broadcast(e);
}

function setWorking(on: boolean) {
  if (!live || live.working === on) return;
  live.working = on;
  broadcast({ type: "working", on });
}

function onTurnEvent(l: Live, e: TurnEvent) {
  if (e.type === "busy") return setWorking(e.on);
  broadcast(e);
  if (e.type === "turn" && e.steps.length) {
    const { type: _, ...entry } = e;
    loaded?.files.appendChat(l.dir, { from: "claude", kind: "steps", ...entry });
  }
}

function readTail(l: Live) {
  if (!l.tail || !l.connected) return;
  for (const r of l.tail.read()) for (const e of l.turns.push(r)) onTurnEvent(l, e);
}

/** Ends the open turn as interrupted and stops tailing; synchronous, for the exit handler. */
function dropTail(l: Live) {
  readTail(l);
  for (const e of l.turns.flush()) onTurnEvent(l, e);
  l.tail = null;
}

/** Tails the locked session's transcript from its current end; the turn that called `attach` is under way. */
function startTail(l: Live) {
  const file = l.sessionId && l.logDir ? path.join(l.logDir, `${l.sessionId}.jsonl`) : null;
  if (file && file === l.tail?.file) return;
  if (l.tail) dropTail(l);
  if (!file || !loaded) return;
  l.tail = new loaded.transcript.Tail(file);
  l.turns.mode = loaded.transcript.lastMode(file);
  for (const e of l.turns.begin(new Date().toISOString())) onTurnEvent(l, e);
}

// --- session tracking --------------------------------------------------------

async function lockSession(l: Live, claimed?: string) {
  const { files } = await load();
  const owner = files.ownerSessionId();
  if (owner && claimed && owner !== claimed) log(`attach claimed session ${claimed}, but the owner file says ${owner}`);
  l.byOwner = !!owner;
  const id = owner ?? claimed;
  if (id) {
    l.sessionId = id;
    l.logDir = files.transcriptDir(id);
  } else {
    // The caller's transcript was written moments ago; widen to the bridge's start only if that finds nothing.
    const t = files.findSession(Math.max(STARTED, Date.now() - 120_000)) ?? files.findSession(STARTED);
    l.sessionId = t?.id ?? null;
    l.logDir = t?.dir ?? null;
  }
  l.lockedAt = Date.now();
  l.connected = true;
  startTail(l);
  files.writeBridgeFile(l.dir, {
    port: l.http.port,
    token: l.token,
    sessionId: l.sessionId,
    pid: process.pid,
    at: new Date().toISOString(),
    // The bridge inherits claude's environment.
    wt: !!process.env.WT_SESSION,
  });
  broadcast({ type: "session", slug: l.slug, sessionId: l.sessionId });
}

async function poll() {
  const l = live;
  if (!l?.connected) return;
  const { files } = await load();
  let next: string | null;
  if (l.byOwner) {
    next = files.ownerSessionId();
  } else if (!l.logDir) {
    if (l.sessionId) l.logDir = files.transcriptDir(l.sessionId);
    else {
      const t = files.findSession(l.lockedAt);
      if (t) Object.assign(l, { sessionId: t.id, logDir: t.dir });
    }
    startTail(l);
    return;
  } else {
    next = files.newestTranscript([l.logDir], l.lockedAt)?.id ?? null;
  }
  if (!next || next === l.sessionId) return;
  dropTail(l);
  l.connected = false;
  setWorking(false);
  l.permissions.clear();
  log(`session moved ${l.sessionId} → ${next}; disconnected ${l.slug}`);
  broadcast({ type: "disconnected", slug: l.slug, sessionId: l.sessionId });
}

// --- inbound: site → Claude --------------------------------------------------

async function onMessage(m: Message): Promise<string | null> {
  const l = live;
  if (!l) return "not attached";
  if (m.kind === "focus") {
    const { files, focus } = await load();
    // The parent is claude.exe, whose console is the tab's. After a /clear the owner file names the new session,
    // whose title the tab shows if the script has to fall back to matching it.
    const id = files.ownerSessionId() ?? l.sessionId;
    return focus.focusTab({ wt: !!process.env.WT_SESSION, claudePid: process.ppid, id, dir: id ? files.transcriptDir(id) : null });
  }
  if (!l.connected) return l.kind.reattach(l.slug);
  const { files, protocol } = await load();

  if (m.kind === "permission") {
    if (!l.permissions.delete(m.request_id)) return `no open permission request ${m.request_id}`;
    await mcp.notification({
      method: "notifications/claude/channel/permission",
      params: { request_id: m.request_id, behavior: m.behavior },
    });
    broadcast({ type: "verdict", request_id: m.request_id, behavior: m.behavior });
    files.appendChat(l.dir, { from: "site", ...m });
    return null;
  }
  if (m.kind === "choice") {
    const error = l.choices.resolve(m);
    if (error) return error;
  }

  const imagesDir = path.join(l.dir, "images");
  const missing = protocol.imagesOf(m).find((n) => !existsSync(path.join(imagesDir, n)));
  if (missing) return `picture ${missing} not found`;

  const owner = l.kinds.exclusiveOwner(m.kind);
  if (owner && owner !== l.kind) return `${m.kind} is for ${owner.plural}; ${l.slug} is a ${l.kind.noun}`;
  await mcp.notification({
    method: "notifications/claude/channel",
    params: protocol.toChannel(m, imagesDir, l.runtime.head(m.slug, l.state), l.kinds.format),
  });
  files.appendChat(l.dir, { from: "site", ...m });
  setWorking(true);
  return null;
}

async function registerPermissionRelay() {
  const { z } = await load();
  const PermissionRequest = z.object({
    method: z.literal("notifications/claude/channel/permission_request"),
    params: z.object({
      request_id: z.string(),
      tool_name: z.string(),
      description: z.string(),
      input_preview: z.string(),
    }),
  });
  mcp.setNotificationHandler(PermissionRequest, async ({ params }) => {
    const l = live;
    if (!l?.connected) return;
    l.permissions.add(params.request_id);
    readTail(l);
    const e = { ...params, ...(l.turns.mode ? { mode: l.turns.mode } : {}) };
    broadcast({ type: "permission", ...e });
    (await load()).files.appendChat(l.dir, { from: "claude", kind: "permission", ...e });
  });
}

// --- attach / detach ---------------------------------------------------------

/** The kind its attach arguments name, and the session in it they name. */
type Target = { kind: Kind; runtime: Runtime; state: unknown };

async function attach({ kind, runtime, state }: Target, sessionId?: string) {
  const { files, protocol, http, transcript } = await load();
  if (live && live.kind === kind && runtime.same(live.state, state)) {
    runtime.reattached?.(live.dir, live.state, state);
    await lockSession(live, sessionId);
    return `re-attached ${live.slug} to this session (port ${live.http.port}).`;
  }
  if (live) await detach();
  const slug = runtime.slug(state);
  const dir = files.sessionDir(kind.folder, slug);
  runtime.opened?.(dir, state);
  if (!relayRegistered) {
    await registerPermissionRelay();
    relayRegistered = true;
  }
  // Every listed kind's messages parse, so one of another kind is refused by name rather than as malformed.
  const kinds = compose(await loadKinds(listed()));

  const token = randomBytes(24).toString("hex");
  const l: Live = {
    slug,
    dir,
    kind,
    runtime,
    state,
    kinds,
    token,
    sessionId: null,
    byOwner: false,
    logDir: null,
    lockedAt: Date.now(),
    connected: true,
    working: false,
    choices: protocol.createChoices(),
    permissions: new Set(),
    poll: setInterval(() => void poll().catch((err) => log(`poll failed: ${err}`)), POLL),
    tail: null,
    turns: new transcript.Turns({ dir, label: kinds.stepLabel }),
    tailTimer: setInterval(() => {
      try {
        if (live) readTail(live);
      } catch (err) {
        log(`tail failed: ${err}`);
      }
    }, TAIL),
    http: await http.startHttp({
      slug,
      token,
      origins: protocol.siteOrigins(),
      parse: protocol.parseMessage<Message>(kinds.messages),
      onMessage,
      snapshot: () => {
        if (!live) return [];
        const e: BridgeEvent[] = [
          { type: "session", slug: live.slug, sessionId: live.sessionId },
          { type: "working", on: live.working },
        ];
        if (live.turns.busy) e.push({ type: "steps", start: live.turns.start, steps: live.turns.steps });
        e.push(...(live.runtime.snapshot?.(live.state) ?? []));
        if (!live.connected) e.push({ type: "disconnected", slug: live.slug, sessionId: live.sessionId });
        return e;
      },
      status: () => ({ connected: !!live?.connected, sessionId: live?.sessionId ?? null, working: !!live?.working }),
    }),
  };
  l.poll.unref();
  l.tailTimer.unref();
  live = l;
  await lockSession(l, sessionId);
  await mcp.sendToolListChanged();
  log(`attached ${slug} on port ${l.http.port}, session ${l.sessionId ?? "(not found yet)"}`);
  return `attached ${slug}: bridge on 127.0.0.1:${l.http.port}; the site page is http://127.0.0.1:${protocol.SITE_PORT}${kind.page(slug, state)}`;
}
let relayRegistered = false;

async function detach() {
  const l = live;
  if (!l) return "not attached";
  clearInterval(l.poll);
  clearInterval(l.tailTimer);
  if (l.connected) dropTail(l);
  live = null;
  l.choices.clear();
  await l.http.close();
  const { files } = await load();
  files.removeBridgeFile(l.dir);
  l.runtime.closed?.(l.dir);
  await mcp.sendToolListChanged();
  log(`detached ${l.slug}`);
  return `detached ${l.slug}`;
}

// --- MCP ---------------------------------------------------------------------

function instructions(kinds: readonly Kind[]) {
  const of = kinds.length ? kinds.map((k) => `${k.skill} ${k.plural}`).join(" and ") : "live sessions";
  const lines = [
    `Belay is the browser view of ${of}. Messages in <channel source="belay"> were typed or clicked on the Belay site; the tag's \`slug\` names the session and \`kind\` what happened.`,
    '- Answer every <channel source="belay"> message by calling mcp__plugin_belay_belay__reply: the user is reading the site, not the terminal. When their latest message was typed in the terminal, answer in the terminal instead. After a reply, keep terminal text to one short line.',
  ];
  if (kinds.length) {
    lines.push(
      `- If \`slug\` is not the session you are running, tell the user ${kinds.map((k) => k.resume).join(" or ")}. Never resume it yourself.`,
      `- Only the ${kinds.map((k) => k.skill).join(" and ")} ${kinds.length === 1 ? "skill calls" : "skills call"} attach.`,
    );
  }
  return [...lines, ...kinds.map((k) => k.instructions)].join("\n");
}

await loadYaml(log);
// Claude Code reads the instructions once, so a settings change shows in them from its next restart.
const mcp = new Server(
  { name: "belay", version: "0.4.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {}, "claude/channel/permission": {} },
      tools: { listChanged: true },
    },
    instructions: instructions(attachable()),
  },
);

const attachTool = (kinds: readonly Kind[]): Tool => ({
  name: "attach",
  description: `Attach this session to the Belay site so it can show it and send messages here: ${kinds.map((k) => k.attach).join(" or ")}. Re-attaching the same ${kinds.map((k) => k.key).join(" or ")} after /clear reconnects it.`,
  _meta: ALWAYS,
  inputSchema: {
    type: "object",
    properties: {
      ...Object.assign({}, ...kinds.map((k) => k.properties)),
      sessionId: { type: "string", description: "This Claude Code session's id, as the skill gives it" },
    },
  },
});
const REPLY: Tool = {
  name: "reply",
  description:
    'Send a message to the Belay site\'s conversation drawer. The only way to answer a <channel source="belay"> message. Markdown, KaTeX and mermaid render there.',
  _meta: ALWAYS,
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", description: "The message (Markdown)" } },
    required: ["text"],
  },
};
const CHOICE: Tool = {
  name: "choice",
  description:
    'Post a choice to the Belay drawer as buttons, in place of AskUserQuestion. Mirror it as text in the terminal. The answer arrives as a kind="choice" message with the returned id.',
  _meta: ALWAYS,
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The question (Markdown)" },
      options: { type: "array", items: { type: "string" }, description: "Button labels, 2–8" },
    },
    required: ["prompt", "options"],
  },
};
const detachTool = (kinds: readonly Kind[]): Tool => ({
  name: "detach",
  description: `Detach from the Belay site: it stops reaching this terminal. Call when the ${kinds.map((k) => k.noun).join(" or ")} ends.`,
  _meta: ALWAYS,
  inputSchema: { type: "object", properties: {} },
});

const toolNames = (kind: Kind) => kind.tools.map((t) => (typeof t === "string" ? t : t.name));
const toolsOf = (kind: Kind, kinds: readonly Kind[]): Tool[] =>
  kind.tools.map((t) => (t === "reply" ? REPLY : t === "choice" ? CHOICE : t === "detach" ? detachTool(kinds) : t));

mcp.setRequestHandler(ListToolsRequestSchema, async () => {
  const kinds = attachable();
  const tools = kinds.length ? [attachTool(kinds)] : [];
  if (live) tools.push(...toolsOf(live.kind, listed()));
  return { tools };
});

/** The session the attach arguments name, or why they name none. */
async function attachTarget(args: Record<string, unknown>): Promise<Target | string> {
  const kinds = attachable();
  const named = kinds.filter((k) => args[k.key] !== undefined);
  if (named.length !== 1) return `pass exactly one of ${kinds.map((k) => `${k.key} (a ${k.noun})`).join(" or ")}`;
  const kind = named[0];
  const runtime = await kind.load();
  const state = runtime.target(args);
  return typeof state === "string" ? state : { kind, runtime, state };
}

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  if (name === "attach") {
    const target = await attachTarget(args);
    if (typeof target === "string") return text(target, true);
    const { sessionId } = args as { sessionId?: unknown };
    // An unsubstituted `${CLAUDE_SESSION_ID}` or other junk is ignored rather than locked onto.
    const id = typeof sessionId === "string" && /^[0-9a-f-]{8,64}$/i.test(sessionId) ? sessionId : undefined;
    return text(await attach(target, id));
  }
  const owner = listed().find((k) => toolNames(k).includes(name));
  if (!owner) throw new Error(`unknown tool: ${name}`);
  const l = live;
  if (!l) return text("not attached: call attach first", true);
  if (!toolNames(l.kind).includes(name)) return text(`${name} is for ${owner.plural}; ${l.slug} is a ${l.kind.noun}`, true);
  if (name === "detach") return text(await detach());
  if (!l.connected) return text("disconnected after /clear: call attach again first", true);

  const { files, z } = await load();
  if (name === "reply") {
    const parsed = z.object({ text: z.string().min(1).max(64_000) }).safeParse(args);
    if (!parsed.success) return text("expected {text} (1–64000 chars)", true);
    broadcast({ type: "reply", text: parsed.data.text });
    files.appendChat(l.dir, { from: "claude", kind: "reply", text: parsed.data.text });
    return text(l.http.clients() ? "sent" : "sent, but no Belay page is open right now; it will show in the history");
  }
  const own = l.runtime.call?.(name, args, { state: l.state, broadcast, log });
  if (own) return own;
  const parsed = z
    .object({ prompt: z.string().min(1).max(4000), options: z.array(z.string().min(1).max(200)).min(2).max(8) })
    .safeParse(args);
  if (!parsed.success) return text("expected {prompt, options: 2–8 labels}", true);
  if (new Set(parsed.data.options).size !== parsed.data.options.length) return text("options must be distinct", true);
  const id = l.choices.open(parsed.data.options);
  broadcast({ type: "choice", id, ...parsed.data });
  files.appendChat(l.dir, { from: "claude", kind: "choice", id, ...parsed.data });
  return text(`choice ${id} is up on the site; the answer arrives as a kind="choice" message with id ${id}`);
});

let initialized = false;
mcp.oninitialized = () => {
  initialized = true;
  const ctx: IdleContext = {
    attached: () => !!live,
    notify: (content, meta) => mcp.notification({ method: "notifications/claude/channel", params: { content, meta } }),
    log,
  };
  for (const k of attachable()) k.idle?.(ctx);
};

// A settings change can add or drop a kind's tools; Claude Code lists them again on tools/list_changed.
try {
  watch(dataDir(), (_, name) => {
    if (initialized && name === "settings.yaml") mcp.sendToolListChanged().catch((err) => log(`list_changed failed: ${err}`));
  })
    .on("error", (err) => log(`settings watch failed: ${err}`))
    .unref();
} catch (err) {
  log(`can't watch ${dataDir()} for settings changes: ${err}`);
}

// bridge.json must not outlive the process, or the site would list a dead session as Live.
process.on("exit", () => {
  if (!live) return;
  if (live.connected) dropTail(live);
  loaded?.files.removeBridgeFile(live.dir);
});
mcp.onclose = () => process.exit(0);
process.stdin.on("end", () => process.exit(0));

await mcp.connect(new StdioServerTransport());
