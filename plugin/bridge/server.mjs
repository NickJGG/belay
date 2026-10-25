/*
 * Sear bridge: the `plugin:sear@sear` Claude Code channel, spawned over stdio by the sear plugin. It carries both
 * kinds of live session the Belay site shows: grills (`/sear`) and lessons (`/learn`).
 *
 * Idle it is MCP only, listing one tool, `attach(slug | course)`. Attaching loads the rest (HTTP, zod, files), binds
 * a free 127.0.0.1 port with a fresh token, writes `<sessions>/<slug>/bridge.json` for the site to find, and
 * announces the session's tools with tools/list_changed: `reply`, `show`, `choice` and `detach`, plus `restart`
 * for a lesson. `detach` undoes all of it. A lesson's slug is made up at its first attach (`lesson-<course>-<time>`),
 * and its folder gets a `kind: "lesson"` session.json; lesson.mts has the start queue and restart.
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
const STARTED = Date.now();
const POLL = 2000;
const TAIL = 250;
const log = (...args) => console.error("[sear-bridge]", ...args);
let modules = null;
const importAll = async () => {
    const [files, protocol, http, transcript, lesson, { z }] = await Promise.all([
        import("./files.mjs"),
        import("./protocol.mjs"),
        import("./http.mjs"),
        import("./transcript.mjs"),
        import("./lesson.mjs"),
        import("zod"),
    ]);
    return { files, protocol, http, transcript, lesson, z };
};
const load = () => (modules ??= importAll().then((m) => {
    loaded = m;
    return m;
}));
// The exit handler is synchronous, so it needs the modules themselves, not the promise.
let loaded = null;
let live = null;
function broadcast(e) {
    live?.http.broadcast(e);
}
function setWorking(on) {
    if (!live || live.working === on)
        return;
    live.working = on;
    broadcast({ type: "working", on });
}
function onTurnEvent(l, e) {
    if (e.type === "busy")
        return setWorking(e.on);
    broadcast(e);
    if (e.type === "turn" && e.steps.length) {
        const { type: _, ...entry } = e;
        loaded?.files.appendChat(l.slug, { from: "claude", kind: "steps", ...entry });
    }
}
function readTail(l) {
    if (!l.tail || !l.connected)
        return;
    for (const r of l.tail.read())
        for (const e of l.turns.push(r))
            onTurnEvent(l, e);
}
/** Ends the open turn as interrupted and stops tailing; synchronous, for the exit handler. */
function dropTail(l) {
    readTail(l);
    for (const e of l.turns.flush())
        onTurnEvent(l, e);
    l.tail = null;
}
/** Tails the locked session's transcript from its current end; the turn that called `attach` is under way. */
function startTail(l) {
    const file = l.sessionId && l.logDir ? path.join(l.logDir, `${l.sessionId}.jsonl`) : null;
    if (file && file === l.tail?.file)
        return;
    if (l.tail)
        dropTail(l);
    if (!file || !loaded)
        return;
    l.tail = new loaded.transcript.Tail(file);
    l.turns.mode = loaded.transcript.lastMode(file);
    for (const e of l.turns.begin(new Date().toISOString()))
        onTurnEvent(l, e);
}
const text = (t, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });
// --- session tracking --------------------------------------------------------
async function lockSession(l, claimed) {
    const { files } = await load();
    const owner = files.ownerSessionId();
    if (owner && claimed && owner !== claimed)
        log(`attach claimed session ${claimed}, but the owner file says ${owner}`);
    l.byOwner = !!owner;
    const id = owner ?? claimed;
    if (id) {
        l.sessionId = id;
        l.logDir = files.transcriptDir(id);
    }
    else {
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
    if (!l?.connected)
        return;
    const { files } = await load();
    let next;
    if (l.byOwner) {
        next = files.ownerSessionId();
    }
    else if (!l.logDir) {
        if (l.sessionId)
            l.logDir = files.transcriptDir(l.sessionId);
        else {
            const t = files.findSession(l.lockedAt);
            if (t)
                Object.assign(l, { sessionId: t.id, logDir: t.dir });
        }
        startTail(l);
        return;
    }
    else {
        next = files.newestTranscript([l.logDir], l.lockedAt)?.id ?? null;
    }
    if (!next || next === l.sessionId)
        return;
    dropTail(l);
    l.connected = false;
    setWorking(false);
    l.permissions.clear();
    log(`session moved ${l.sessionId} → ${next}; disconnected ${l.slug}`);
    broadcast({ type: "disconnected", slug: l.slug, sessionId: l.sessionId });
}
// --- inbound: site → Claude --------------------------------------------------
async function onMessage(m) {
    const l = live;
    if (!l)
        return "not attached";
    if (!l.connected)
        return `disconnected: run \`/sear resume ${l.slug}\` in the terminal`;
    const { files, protocol } = await load();
    if (m.kind === "permission") {
        if (!l.permissions.delete(m.request_id))
            return `no open permission request ${m.request_id}`;
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
        if (error)
            return error;
    }
    const imagesDir = path.join(files.sessionDir(l.slug), "images");
    const missing = protocol.imagesOf(m).find((n) => !existsSync(path.join(imagesDir, n)));
    if (missing)
        return `picture ${missing} not found`;
    if ((m.kind === "attempt" || m.kind === "restart") && !l.lesson)
        return `${m.kind} is for lessons; ${l.slug} is a grill`;
    await mcp.notification({
        method: "notifications/claude/channel",
        params: protocol.toChannel(m, imagesDir, l.lesson ? { course: l.lesson.course } : undefined),
    });
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
        if (!l?.connected)
            return;
        l.permissions.add(params.request_id);
        readTail(l);
        const e = { ...params, ...(l.turns.mode ? { mode: l.turns.mode } : {}) };
        broadcast({ type: "permission", ...e });
        (await load()).files.appendChat(l.slug, { from: "claude", kind: "permission", ...e });
    });
}
// --- attach / detach ---------------------------------------------------------
/** `lesson-<course>-<yyyymmdd>-<hhmm>`, local time, trimmed to the slug limit. */
function lessonSlug(course) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    return `lesson-${course.slice(0, 64 - 22).replace(/-+$/, "")}-${stamp}`;
}
async function attach(target, sessionId) {
    const { files, protocol, http, transcript } = await load();
    const again = live && ("slug" in target ? live.slug === target.slug : live.lesson?.course === target.course);
    if (live && again) {
        if (!("slug" in target) && target.topic) {
            live.lesson = { course: target.course, topic: target.topic };
            files.writeLessonSession(live.slug, { topic: target.topic });
        }
        await lockSession(live, sessionId);
        return `re-attached ${live.slug} to this session (port ${live.http.port}).`;
    }
    if (live)
        await detach();
    const lesson = "slug" in target ? null : { course: target.course, ...(target.topic ? { topic: target.topic } : {}) };
    const slug = "slug" in target ? target.slug : lessonSlug(target.course);
    if (lesson) {
        const now = new Date().toISOString();
        files.writeLessonSession(slug, { course: lesson.course, topic: lesson.topic ?? `Lesson · ${lesson.course}`, status: "in-progress", started: now });
    }
    if (!relayRegistered) {
        await registerPermissionRelay();
        relayRegistered = true;
    }
    const token = randomBytes(24).toString("hex");
    const l = {
        slug,
        lesson,
        focus: null,
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
                if (live)
                    readTail(live);
            }
            catch (err) {
                log(`tail failed: ${err}`);
            }
        }, TAIL),
        http: await http.startHttp({
            slug,
            token,
            origins: protocol.siteOrigins(),
            onMessage,
            snapshot: () => {
                if (!live)
                    return [];
                const e = [
                    { type: "session", slug: live.slug, sessionId: live.sessionId },
                    { type: "working", on: live.working },
                ];
                if (live.turns.busy)
                    e.push({ type: "steps", start: live.turns.start, steps: live.turns.steps });
                if (live.focus)
                    e.push(live.focus);
                if (!live.connected)
                    e.push({ type: "disconnected", slug: live.slug, sessionId: live.sessionId });
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
    const page = lesson ? `/courses/${lesson.course}/now` : `/s/${slug}`;
    return `attached ${slug}: bridge on 127.0.0.1:${l.http.port}; the site page is http://127.0.0.1:${protocol.SITE_PORT}${page}`;
}
let relayRegistered = false;
async function detach() {
    const l = live;
    if (!l)
        return "not attached";
    clearInterval(l.poll);
    clearInterval(l.tailTimer);
    if (l.connected)
        dropTail(l);
    live = null;
    l.choices.clear();
    await l.http.close();
    const { files } = await load();
    files.removeBridgeFile(l.slug);
    if (l.lesson)
        files.writeLessonSession(l.slug, { status: "done" });
    await mcp.sendToolListChanged();
    log(`detached ${l.slug}`);
    return `detached ${l.slug}`;
}
// --- MCP ---------------------------------------------------------------------
const INSTRUCTIONS = `\
Belay is the browser view of /sear grills and /learn lessons. Messages in <channel source="sear"> were typed or clicked on the Belay site; the tag's \`slug\` names the session and \`kind\` what happened.
- Answer every <channel source="sear"> message by calling mcp__plugin_sear_sear__reply: the user is reading the site, not the terminal. When their latest message was typed in the terminal, answer in the terminal instead. After a reply, keep terminal text to one short line.
- If \`slug\` is not the session you are running, tell the user to run \`/sear resume <slug>\` (a grill) or to start the lesson again in the terminal. Never resume it yourself.
- Only the /sear and /learn skills call attach.
Grills (/sear): kind="answer": they picked option \`opt\` for question \`q\`, maybe with a note. kind="comment": a comment on the element at \`selector\` in that option's mock. kind="choice": their answer to a choice you posted, by button (\`option\`) or as free text. Follow the /sear skill for when to use show and choice.
Lessons (/learn; the tag has \`course\`):
- kind="attempt": the learner submitted work. Read the file at \`path\` (in the course folder) and respond to it. Never edit it.
- kind="command" (it can arrive before any attach): the learner pressed a start button on the site. Run \`command\` with the Skill tool (skill \`learn\` or \`learn:<sub>\`, the rest as args). This replaces any earlier topic.
- kind="restart": the learner wants a fresh session. If wrap="true", first run the learn skill's "Ending early" close for what was covered. Then call mcp__plugin_sear_sear__restart. Don't start anything else.
- Call mcp__plugin_sear_sear__show with target "claim" when you move on to teaching a new claim, so the learner's page follows you there; not for claims you merely cite. Use "work" or "source" when you start discussing that file, and "whiteboard" after writing now.md. Never point at misconceptions. During a checkpoint, don't show claims or sources.
- The site renders Markdown, KaTeX ($…$, $$…$$) and \`\`\`mermaid blocks, so notation and diagrams may go inline in replies.`;
const mcp = new Server({ name: "sear", version: "0.3.0" }, {
    capabilities: {
        experimental: { "claude/channel": {}, "claude/channel/permission": {} },
        tools: { listChanged: true },
    },
    instructions: INSTRUCTIONS,
});
// Deferred behind ToolSearch, Claude answered channel messages in the terminal instead (topo).
const ALWAYS = { "anthropic/alwaysLoad": true };
const ATTACH = {
    name: "attach",
    description: "Attach this session to the Belay site so it can show it and send messages here: a grill by `slug` (the /sear skill, when a grill starts or resumes) or a lesson by `course` (the /learn skills, when a routine starts). Re-attaching the same slug or course after /clear reconnects it.",
    _meta: ALWAYS,
    inputSchema: {
        type: "object",
        properties: {
            slug: { type: "string", description: "A grill's session slug, e.g. grill-preview-bridge" },
            course: { type: "string", description: "A lesson's course folder, e.g. llm-architecture" },
            topic: { type: "string", description: "A lesson's title on the site, e.g. Lesson · backprop-autograd" },
            sessionId: { type: "string", description: "This Claude Code session's id, as the skill gives it" },
        },
    },
};
const REPLY = {
    name: "reply",
    description: 'Send a message to the Belay site\'s conversation drawer. The only way to answer a <channel source="sear"> message. Markdown, KaTeX and mermaid render there.',
    _meta: ALWAYS,
    inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "The message (Markdown)" } },
        required: ["text"],
    },
};
const CHOICE = {
    name: "choice",
    description: 'Post a choice to the Belay drawer as buttons, in place of AskUserQuestion. Mirror it as text in the terminal. The answer arrives as a kind="choice" message with the returned id.',
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
const DETACH = {
    name: "detach",
    description: "Detach from the Belay site: it stops reaching this terminal. Call when the grill or lesson ends.",
    _meta: ALWAYS,
    inputSchema: { type: "object", properties: {} },
};
const GRILL_TOOLS = [
    REPLY,
    {
        name: "show",
        description: "Point the Belay grill page at a question (and option): the page follows unless the user is looking elsewhere.",
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
    CHOICE,
    DETACH,
];
const LESSON_TOOLS = [
    REPLY,
    {
        name: "show",
        description: "Point the learner's Belay page at what you are teaching now: a knowledge claim, the whiteboard (now.md), a work file or a source. The page follows unless the learner has wandered off.",
        _meta: ALWAYS,
        inputSchema: {
            type: "object",
            properties: {
                target: { type: "string", enum: ["claim", "whiteboard", "work", "source"] },
                topic: { type: "string", description: "claim: the knowledge topic, e.g. backprop-autograd" },
                id: { type: "string", description: "claim: the block id, e.g. c3; source: the source id" },
                path: { type: "string", description: "work: the file's path in the course folder, e.g. work/flops.py" },
            },
            required: ["target"],
        },
    },
    CHOICE,
    {
        name: "restart",
        description: 'End this Claude session so the launcher relaunches a fresh one that runs the routine the learner started on the site. Only call it for a kind="restart" message, as the last thing in the turn.',
        _meta: ALWAYS,
        inputSchema: { type: "object", properties: {} },
    },
    DETACH,
];
const toolsOf = (l) => (l.lesson ? LESSON_TOOLS : GRILL_TOOLS);
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: live ? [ATTACH, ...toolsOf(live)] : [ATTACH] }));
/** The attach target its arguments name, or why they name none. */
async function attachTarget(args) {
    const { protocol, lesson } = await load();
    const { slug, course, topic } = args;
    if ((slug === undefined) === (course === undefined))
        return "pass exactly one of slug (a grill) or course (a lesson)";
    if (slug !== undefined) {
        return typeof slug === "string" && protocol.SLUG.test(slug) ? { slug } : "slug must be lowercase letters, digits and dashes";
    }
    if (typeof course !== "string" || !lesson.courseExists(course))
        return `no course ${String(course)} in ${lesson.learningRoot()}`;
    const t = typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 120) : undefined;
    return { course, ...(t ? { topic: t } : {}) };
}
mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    if (name === "attach") {
        const target = await attachTarget(args);
        if (typeof target === "string")
            return text(target, true);
        const { sessionId } = args;
        // An unsubstituted `${CLAUDE_SESSION_ID}` or other junk is ignored rather than locked onto.
        const id = typeof sessionId === "string" && /^[0-9a-f-]{8,64}$/i.test(sessionId) ? sessionId : undefined;
        return text(await attach(target, id));
    }
    if (![...GRILL_TOOLS, ...LESSON_TOOLS].some((t) => t.name === name))
        throw new Error(`unknown tool: ${name}`);
    const l = live;
    if (!l)
        return text("not attached: call attach first", true);
    if (!toolsOf(l).some((t) => t.name === name))
        return text(`${name} is for lessons; ${l.slug} is a grill`, true);
    if (name === "detach")
        return text(await detach());
    if (!l.connected)
        return text("disconnected after /clear: call attach again first", true);
    const { files, lesson, z } = await load();
    if (name === "reply") {
        const parsed = z.object({ text: z.string().min(1).max(64_000) }).safeParse(args);
        if (!parsed.success)
            return text("expected {text} (1–64000 chars)", true);
        broadcast({ type: "reply", text: parsed.data.text });
        files.appendChat(l.slug, { from: "claude", kind: "reply", text: parsed.data.text });
        return text(l.http.clients() ? "sent" : "sent, but no Belay page is open right now; it will show in the history");
    }
    if (name === "show" && l.lesson) {
        const parsed = lesson.Show.safeParse(args);
        if (!parsed.success)
            return text("expected {target, topic?, id?, path?}", true);
        const error = lesson.showError(l.lesson.course, parsed.data);
        if (error)
            return text(error, true);
        const e = { type: "show", course: l.lesson.course, ...parsed.data };
        l.focus = e;
        broadcast(e);
        return text("shown");
    }
    if (name === "show") {
        const parsed = z
            .object({ q: z.number().int().min(1).max(999), opt: z.string().regex(/^[A-Za-z0-9-]{1,16}$/).optional() })
            .safeParse(args);
        if (!parsed.success)
            return text("expected {q: question number, opt?: option key}", true);
        broadcast({ type: "show", ...parsed.data });
        return text("shown");
    }
    if (name === "restart") {
        if (!lesson.readQueue())
            return text("cancelled: the learner cancelled the start");
        // Leave time for Claude Code to record the tool result before the process dies.
        setTimeout(() => lesson.endClaude(log), 500);
        return text("restarting");
    }
    const parsed = z
        .object({ prompt: z.string().min(1).max(4000), options: z.array(z.string().min(1).max(200)).min(2).max(8) })
        .safeParse(args);
    if (!parsed.success)
        return text("expected {prompt, options: 2–8 labels}", true);
    if (new Set(parsed.data.options).size !== parsed.data.options.length)
        return text("options must be distinct", true);
    const id = l.choices.open(parsed.data.options);
    broadcast({ type: "choice", id, ...parsed.data });
    files.appendChat(l.slug, { from: "claude", kind: "choice", id, ...parsed.data });
    return text(`choice ${id} is up on the site; the answer arrives as a kind="choice" message with id ${id}`);
});
/**
 * An idle session in the Handhold root sends the site's queued start as a `kind="command"` message, which runs the
 * routine's skill, which attaches. It checks at startup (a restart's fresh session) and then every second while idle
 * (a `sear learn` started before the button was pressed). Only the files module loads until a start is queued.
 */
async function startQueued() {
    const { queueFile } = await import("./files.mjs");
    if (live || !existsSync(queueFile()))
        return;
    const { lesson } = await load();
    const q = lesson.readQueue();
    if (!q)
        return;
    lesson.clearQueue();
    await mcp.notification({
        method: "notifications/claude/channel",
        params: {
            content: `Belay site: start ${q.label} (\`${q.command}\`).`,
            meta: { kind: "command", course: q.course, command: q.command },
        },
    });
}
// A channel message sent the moment the handshake ends may arrive before Claude Code listens for it.
const COMMAND_DELAY = 2000;
const QUEUE_POLL = 1000;
mcp.oninitialized = async () => {
    const { inLearningRoot } = await import("./files.mjs");
    if (!inLearningRoot(process.env.CLAUDE_PROJECT_DIR ?? process.cwd()))
        return;
    let checking = false;
    const check = () => {
        if (checking)
            return;
        checking = true;
        startQueued()
            .catch((err) => log(`queued start failed: ${err}`))
            .finally(() => (checking = false));
    };
    setTimeout(() => {
        check();
        setInterval(check, QUEUE_POLL).unref();
    }, COMMAND_DELAY).unref();
};
// bridge.json must not outlive the process, or the site would list a dead session as Live.
process.on("exit", () => {
    if (!live)
        return;
    if (live.connected)
        dropTail(live);
    loaded?.files.removeBridgeFile(live.slug);
});
mcp.onclose = () => process.exit(0);
process.stdin.on("end", () => process.exit(0));
await mcp.connect(new StdioServerTransport());
