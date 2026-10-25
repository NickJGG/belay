/*
 * Sear bridge: the `plugin:sear@sear` Claude Code channel, spawned over stdio by the sear plugin.
 *
 * Idle it is MCP only, listing one tool, `attach(slug)`. Attaching loads the rest (HTTP, zod, files), binds a
 * free 127.0.0.1 port with a fresh token, writes `<sessions>/<slug>/bridge.json` for the site to find, and
 * announces `reply`, `show`, `choice` and `detach` with tools/list_changed. `detach` undoes all of it.
 *
 * Site messages (http.mts, protocol.mts) become `<channel source="sear">` notifications; replies, choices,
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
import { existsSync } from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { BridgeEvent, BridgeHttp } from "./http.mts";
import type { Message } from "./protocol.mts";
import type { Tail, TurnEvent, Turns } from "./transcript.mts";

const STARTED = Date.now();
const POLL = 2000;
const TAIL = 250;
const log = (...args: unknown[]) => console.error("[sear-bridge]", ...args);

let modules: ReturnType<typeof importAll> | null = null;
const importAll = async () => {
  const [files, protocol, http, transcript, { z }] = await Promise.all([
    import("./files.mts"),
    import("./protocol.mts"),
    import("./http.mts"),
    import("./transcript.mts"),
    import("zod"),
  ]);
  return { files, protocol, http, transcript, z };
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
    loaded?.files.appendChat(l.slug, { from: "claude", kind: "steps", ...entry });
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

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError } : {}) });

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
  files.writeBridgeFile(l.slug, {
    port: l.http.port,
    token: l.token,
    sessionId: l.sessionId,
    pid: process.pid,
    at: new Date().toISOString(),
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
  if (!l.connected) return `disconnected: run \`/sear resume ${l.slug}\` in the terminal`;
  const { files, protocol } = await load();

  if (m.kind === "permission") {
    if (!l.permissions.delete(m.request_id)) return `no open permission request ${m.request_id}`;
    await mcp.notification({
      method: "notifications/claude/channel/permission",
      params: { request_id: m.request_id, behavior: m.behavior },
    });
    broadcast({ type: "verdict", request_id: m.request_id, behavior: m.behavior });
    files.appendChat(l.slug, { from: "site", ...m });
    return null;
  }
  if (m.kind === "choice") {
    const error = l.choices.resolve(m);
    if (error) return error;
  }

  const imagesDir = path.join(files.sessionDir(l.slug), "images");
  const missing = protocol.imagesOf(m).find((n) => !existsSync(path.join(imagesDir, n)));
  if (missing) return `picture ${missing} not found`;

  await mcp.notification({ method: "notifications/claude/channel", params: protocol.toChannel(m, imagesDir) });
  files.appendChat(l.slug, { from: "site", ...m });
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
    (await load()).files.appendChat(l.slug, { from: "claude", kind: "permission", ...e });
  });
}

// --- attach / detach ---------------------------------------------------------

async function attach(slug: string, sessionId?: string) {
  const { files, protocol, http, transcript } = await load();
  if (live?.slug === slug) {
    await lockSession(live, sessionId);
    return `re-attached ${slug} to this session (port ${live.http.port}).`;
  }
  if (live) await detach();
  if (!relayRegistered) {
    await registerPermissionRelay();
    relayRegistered = true;
  }

  const token = randomBytes(24).toString("hex");
  const l: Live = {
    slug,
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
    turns: new transcript.Turns({ slug, sessionsDir: files.sessionsDir() }),
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
      onMessage,
      snapshot: () => {
        if (!live) return [];
        const e: BridgeEvent[] = [
          { type: "session", slug: live.slug, sessionId: live.sessionId },
          { type: "working", on: live.working },
        ];
        if (live.turns.busy) e.push({ type: "steps", start: live.turns.start, steps: live.turns.steps });
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
  return `attached ${slug}: bridge on 127.0.0.1:${l.http.port}; the site page is http://127.0.0.1:${protocol.SITE_PORT}/s/${slug}`;
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
  (await load()).files.removeBridgeFile(l.slug);
  await mcp.sendToolListChanged();
  log(`detached ${l.slug}`);
  return `detached ${l.slug}`;
}

// --- MCP ---------------------------------------------------------------------

const INSTRUCTIONS = `\
Sear is the browser view of a /sear grill session. Messages in <channel source="sear"> were typed or clicked on the Sear site; the tag's \`slug\` names the session and \`kind\` what happened.
- Answer every <channel source="sear"> message by calling mcp__plugin_sear_sear__reply: the user is reading the site, not the terminal. When their latest message was typed in the terminal, answer in the terminal instead. After a reply, keep terminal text to one short line.
- kind="answer": they picked option \`opt\` for question \`q\`, maybe with a note. kind="comment": a comment on the element at \`selector\` in that option's mock. kind="choice": their answer to a choice you posted, by button (\`option\`) or as free text.
- If \`slug\` is not the session you are running, tell the user to run \`/sear resume <slug>\` in the terminal. Never resume it yourself.
- Only the /sear skill calls attach; follow its instructions for when to use show and choice.`;

const mcp = new Server(
  { name: "sear", version: "0.2.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {}, "claude/channel/permission": {} },
      tools: { listChanged: true },
    },
    instructions: INSTRUCTIONS,
  },
);

// Deferred behind ToolSearch, Claude answered channel messages in the terminal instead (topo).
const ALWAYS = { "anthropic/alwaysLoad": true };
const ATTACH = {
  name: "attach",
  description:
    "Attach this session to a Sear grill session so the Sear site can show it and send messages here. Called by the /sear skill when a grill starts or resumes; re-attaching the same slug after /clear reconnects it.",
  _meta: ALWAYS,
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "The session slug, e.g. grill-preview-bridge" },
      sessionId: { type: "string", description: "This Claude Code session's id, as the /sear skill gives it" },
    },
    required: ["slug"],
  },
};
const ATTACHED = [
  {
    name: "reply",
    description:
      'Send a message to the Sear site\'s conversation drawer. The only way to answer a <channel source="sear"> message. Markdown, KaTeX and mermaid render there.',
    _meta: ALWAYS,
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The message (Markdown)" } },
      required: ["text"],
    },
  },
  {
    name: "show",
    description: "Point the Sear site at a question (and option): the page follows unless the user is looking elsewhere.",
    _meta: ALWAYS,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "integer", description: "Question number" },
        opt: { type: "string", description: "Option key, e.g. a or b1" },
      },
      required: ["q"],
    },
  },
  {
    name: "choice",
    description:
      'Post a choice to the Sear drawer as buttons, in place of AskUserQuestion. Mirror it as text in the terminal. The answer arrives as a kind="choice" message with the returned id.',
    _meta: ALWAYS,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The question (Markdown)" },
        options: { type: "array", items: { type: "string" }, description: "Button labels, 2–8" },
      },
      required: ["prompt", "options"],
    },
  },
  {
    name: "detach",
    description: "Detach from the Sear session: the site stops reaching this terminal. Call when the grill ends.",
    _meta: ALWAYS,
    inputSchema: { type: "object", properties: {} },
  },
];

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: live ? [ATTACH, ...ATTACHED] : [ATTACH] }));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  if (name === "attach") {
    const { protocol } = await load();
    const { slug, sessionId } = args as { slug?: unknown; sessionId?: unknown };
    if (typeof slug !== "string" || !protocol.SLUG.test(slug)) return text("slug must be lowercase letters, digits and dashes", true);
    // An unsubstituted `${CLAUDE_SESSION_ID}` or other junk is ignored rather than locked onto.
    const id = typeof sessionId === "string" && /^[0-9a-f-]{8,64}$/i.test(sessionId) ? sessionId : undefined;
    return text(await attach(slug, id));
  }
  if (!ATTACHED.some((t) => t.name === name)) throw new Error(`unknown tool: ${name}`);
  const l = live;
  if (!l) return text("not attached: call attach first", true);
  if (name === "detach") return text(await detach());
  if (!l.connected) return text(`disconnected after /clear: call attach("${l.slug}") again first`, true);

  const { files, z } = await load();
  if (name === "reply") {
    const parsed = z.object({ text: z.string().min(1).max(64_000) }).safeParse(args);
    if (!parsed.success) return text("expected {text} (1–64000 chars)", true);
    broadcast({ type: "reply", text: parsed.data.text });
    files.appendChat(l.slug, { from: "claude", kind: "reply", text: parsed.data.text });
    return text(l.http.clients() ? "sent" : "sent, but no Sear page is open right now; it will show in the history");
  }
  if (name === "show") {
    const parsed = z
      .object({ q: z.number().int().min(1).max(999), opt: z.string().regex(/^[A-Za-z0-9-]{1,16}$/).optional() })
      .safeParse(args);
    if (!parsed.success) return text("expected {q: question number, opt?: option key}", true);
    broadcast({ type: "show", ...parsed.data });
    return text("shown");
  }
  const parsed = z
    .object({ prompt: z.string().min(1).max(4000), options: z.array(z.string().min(1).max(200)).min(2).max(8) })
    .safeParse(args);
  if (!parsed.success) return text("expected {prompt, options: 2–8 labels}", true);
  if (new Set(parsed.data.options).size !== parsed.data.options.length) return text("options must be distinct", true);
  const id = l.choices.open(parsed.data.options);
  broadcast({ type: "choice", id, ...parsed.data });
  files.appendChat(l.slug, { from: "claude", kind: "choice", id, ...parsed.data });
  return text(`choice ${id} is up on the site; the answer arrives as a kind="choice" message with id ${id}`);
});

// bridge.json must not outlive the process, or the site would list a dead session as Live.
process.on("exit", () => {
  if (!live) return;
  if (live.connected) dropTail(live);
  loaded?.files.removeBridgeFile(live.slug);
});
mcp.onclose = () => process.exit(0);
process.stdin.on("end", () => process.exit(0));

await mcp.connect(new StdioServerTransport());
