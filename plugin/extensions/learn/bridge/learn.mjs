/**
 * Lessons (`/learn:learn`) on the bridge: the descriptor, loaded at startup, with the Learning root and the start flow's
 * files. The runtime is learn.runtime.mts.
 *
 * Starting a routine from the site restarts into a fresh session: the site writes `~/Belay/.run/start.json`, the
 * lesson's `restart` tool writes `~/Belay/.run/restart` and ends `claude`, `belay claude`'s loop relaunches it, and the
 * new bridge (idle, in the Learning root) consumes the queue and sends it as a `kind="command"` message.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDir } from "../../../bridge/files.mjs";
import { ALWAYS } from "../../../bridge/kind.mjs";
export const learningRoot = () => process.env.LEARNING_ROOT || path.join(os.homedir(), "Learning");
/** Whether `dir` is the Learning root, where a queued lesson start may run. */
export const inLearningRoot = (dir) => path.relative(path.resolve(learningRoot()), path.resolve(dir)) === "";
/** The site's queued lesson start (`extensions/learn/web/_lib/start-queue.ts` writes it). */
export const queueFile = () => path.join(runDir(), "start.json");
/** While this exists when `claude` exits, `belay claude`'s loop starts it again. */
export const restartFile = () => path.join(runDir(), "restart");
/** Sends the site's queued start as a `kind="command"` message, which runs the routine's skill, which attaches. */
async function startQueued(ctx) {
    if (ctx.attached() || !existsSync(queueFile()))
        return;
    const { readQueue, clearQueue } = await import("./learn.runtime.mjs");
    const q = readQueue();
    if (!q)
        return;
    clearQueue();
    await ctx.notify(`Belay site: start ${q.label} (\`${q.command}\`).`, { kind: "command", course: q.course, command: q.command });
}
// A channel message sent the moment the handshake ends may arrive before Claude Code listens for it.
const COMMAND_DELAY = 2000;
const QUEUE_POLL = 1000;
export const kind = {
    id: "learn",
    noun: "lesson",
    plural: "lessons",
    skill: "/learn:learn",
    folder: "lessons",
    key: "course",
    properties: {
        course: { type: "string", description: "A lesson's course folder, e.g. llm-architecture" },
        topic: { type: "string", description: "A lesson's title on the site, e.g. Lesson · Backpropagation and autograd" },
    },
    attach: "a lesson by `course` (the learn plugin's skills, when a routine starts)",
    resume: "to start the lesson again in the terminal",
    instructions: `\
Lessons (/learn:learn; the tag has \`course\`):
- kind="attempt": the learner submitted work. Read the file at \`path\` (in the course folder) and respond to it. Never edit it. When the message carries the file's summary (a diagram), respond to that. Never Read a \`.excalidraw\` file: if no summary came, run \`belay work read\` on it.
- kind="command" (it can arrive before any attach): the learner pressed a start button on the site. Run \`command\` with the Skill tool (skill \`learn:learn\` or \`learn:<sub>\`, the rest as args). This replaces any earlier topic.
- kind="restart": the learner wants a fresh session. If wrap="true", first run the learn skill's "Ending early" close for what was covered. Then call mcp__plugin_belay_belay__restart. Don't start anything else.
- Call mcp__plugin_belay_belay__show with target "claim" when you move on to teaching a new claim, so the learner's page follows you there; not for claims you merely cite. Use "work" or "source" when you start discussing that file, and "whiteboard" after writing now.md. Never point at misconceptions. During a checkpoint, don't show claims or sources.
- The site renders Markdown, KaTeX ($…$, $$…$$) and \`\`\`mermaid blocks, so notation and diagrams may go inline in replies.`,
    tools: [
        "reply",
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
        "choice",
        {
            name: "restart",
            description: 'End this Claude session so `belay claude` relaunches a fresh one that runs the routine the learner started on the site. Only call it for a kind="restart" message, as the last thing in the turn.',
            _meta: ALWAYS,
            inputSchema: { type: "object", properties: {} },
        },
        "detach",
    ],
    reattach: () => "disconnected: start the routine again in the terminal",
    page: (_slug, state) => `/learn/${state.course}/now`,
    /**
     * An idle session in the Learning root checks for a queued start at startup (a restart's fresh session) and then
     * every second (a `belay learn` started before the button was pressed). The runtime loads only once one is queued.
     */
    idle(ctx) {
        if (!inLearningRoot(process.env.CLAUDE_PROJECT_DIR ?? process.cwd()))
            return;
        let checking = false;
        const check = () => {
            if (checking)
                return;
            checking = true;
            startQueued(ctx)
                .catch((err) => ctx.log(`queued start failed: ${err}`))
                .finally(() => (checking = false));
        };
        setTimeout(() => {
            check();
            setInterval(check, QUEUE_POLL).unref();
        }, COMMAND_DELAY).unref();
    },
    load: async () => (await import("./learn.runtime.mjs")).runtime,
};
