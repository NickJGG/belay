/**
 * The site server's connection to one attached bridge: reads its `bridge.json`, holds `GET /events` open
 * and reports each event. An open stream is what makes a session Live: it proves the pid's bridge answers,
 * as `/status` would, and carries the events too.
 */
import { readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { applyResult, toStep, type OpenTurn } from "./chat.ts";
import { parseFocus, type Focus } from "./extensions.ts";

/** `wt`: the session runs under Windows Terminal. */
export type BridgeFile = { port: number; token: string; sessionId: string | null; pid: number; at: string; wt: boolean };

export function readBridgeFile(sessionDir: string): BridgeFile | null {
  try {
    const b = JSON.parse(readFileSync(join(sessionDir, "bridge.json"), "utf8"));
    if (!Number.isInteger(b?.port) || typeof b.token !== "string" || !Number.isInteger(b.pid)) return null;
    return { port: b.port, token: b.token, sessionId: b.sessionId ?? null, pid: b.pid, at: String(b.at ?? ""), wt: b.wt === true };
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export const sameBridge = (a: BridgeFile, b: BridgeFile) => a.port === b.port && a.token === b.token && a.pid === b.pid;

export type BridgeEvent = { type: string } & Record<string, unknown>;

export type UpstreamState = { up: boolean; working: boolean; connected: boolean; sessionId: string | null };

export type Upstream = {
  file: BridgeFile;
  state: () => UpstreamState;
  /** The bridge's turn in progress, so a page opened mid-turn can draw it; null between turns. */
  turn: () => OpenTurn | null;
  /** The last `show` a kind reads as its focus (a lesson's), so a page opened later can follow it. */
  focus: () => Focus | null;
  /** Resolves once the first connection attempt has opened the stream or failed. */
  ready: Promise<void>;
  close: () => void;
};

const RETRY_MS = 2000;
const CONNECT_TIMEOUT_MS = 1500;

/**
 * Connects to the bridge in `file` and keeps reconnecting while its pid is alive. `onEvent` gets every bridge
 * event; `onChange` fires when `up` flips or the working/connected state changes.
 */
export function connectUpstream(
  file: BridgeFile,
  { onEvent, onChange }: { onEvent: (e: BridgeEvent) => void; onChange: (s: UpstreamState) => void },
): Upstream {
  let state: UpstreamState = { up: false, working: false, connected: true, sessionId: file.sessionId };
  let turn: OpenTurn | null = null;
  let focus: Focus | null = null;
  let closed = false;
  let req: http.ClientRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle!: () => void;
  const ready = new Promise<void>((r) => (settle = r));

  const set = (patch: Partial<UpstreamState>) => {
    const next = { ...state, ...patch };
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    if (!closed) onChange(state);
  };

  const onData = (data: string) => {
    let e: BridgeEvent;
    try {
      e = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof e?.type !== "string") return;
    if (e.type === "working") set({ working: !!e.on });
    else if (e.type === "session") set({ connected: true, sessionId: (e.sessionId as string | null) ?? null });
    else if (e.type === "disconnected") set({ connected: false, working: false });
    if (e.type === "steps") turn = { start: String(e.start), steps: Array.isArray(e.steps) ? e.steps.map(toStep) : [] };
    else if (e.type === "step") {
      const step = toStep(e);
      turn = turn ? { ...turn, steps: [...turn.steps, step] } : { start: step.at, steps: [step] };
    } else if (e.type === "result") {
      if (turn) turn = applyResult(turn, e);
    } else if (e.type === "turn" || e.type === "disconnected") turn = null;
    if (e.type === "show") focus = parseFocus(e) ?? focus;
    if (!closed) onEvent(e);
  };

  const connect = () => {
    if (closed) return;
    if (!pidAlive(file.pid)) {
      set({ up: false, working: false });
      return settle();
    }
    let retried = false;
    const retry = () => {
      if (retried) return;
      retried = true;
      req?.destroy();
      // The next connection's snapshot sends the turn again.
      turn = null;
      set({ up: false, working: false });
      settle();
      if (!closed) timer = setTimeout(connect, RETRY_MS);
      timer?.unref();
    };
    let buffer = "";
    req = http.get(
      { host: "127.0.0.1", port: file.port, path: "/events", headers: { "X-Belay-Token": file.token }, timeout: CONNECT_TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return retry();
        }
        req?.setTimeout(0);
        set({ up: true });
        settle();
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = frame
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (data) onData(data);
          }
        });
        res.on("end", retry);
        res.on("error", retry);
      },
    );
    req.on("timeout", retry);
    req.on("error", retry);
  };
  connect();

  return {
    file,
    state: () => state,
    turn: () => turn,
    focus: () => focus,
    ready,
    close: () => {
      closed = true;
      clearTimeout(timer);
      req?.destroy();
      settle();
    },
  };
}
