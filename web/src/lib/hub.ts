import "server-only";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { dataDir } from "../../../src/config.ts";
import type { OpenTurn } from "./chat";
import type { LessonShow } from "./lesson";
import type { Queue } from "./start-queue";
import { grillsDir, lessonsDir } from "./config";
import { isSlug } from "./sessions";
import { connectUpstream, readBridgeFile, sameBridge, type BridgeEvent, type Upstream } from "./upstream";
import { UsageStore, type StatusLine, type Usage } from "./usage";
import { root as learningRoot } from "./courses";
import { belayIgnored, belayWatched, courseIgnored, courseLocate, locate, sessionIgnored } from "./watch-paths";

/*
 * The server's one event hub, started by its first user. It watches the grills and lessons roots and holds an
 * upstream to every attached bridge (a `bridge.json` appearing or changing reconnects it), and fans
 * everything out to `/api/events`:
 *   sessions  a session's session.json, <slug>.md or bridge.json changed, or its folder came or went
 *   file      another file of a session folder changed (chat.jsonl, the mock files)
 *   live      a bridge's stream opened or closed, or its working/connected state changed
 *   bridge    one bridge event, tagged with its session's slug
 *   usage     a live session's meters, from the status line's POST to /api/usage (matched by the bridge's sessionId)
 *   limits    the account-wide 5h and 7d limits from that same POST, live session or not (Home's rings)
 *   belay     an issue, project, log day or order.yaml in belay's data dir changed (by a page, the CLI or Claude)
 *   course    a visible file of a course folder changed (see `visibleParts`), as `{course, path}`
 *   start     the queued lesson start (start-queue.ts) was set or cleared, by `/api/lesson/start`
 */

/** `wt`: its terminal is a Windows Terminal tab, which the bridge can focus. */
export type LiveSession = { slug: string; working: boolean; connected: boolean; sessionId: string | null; wt: boolean };

export type HubEvent =
  | { type: "sessions"; slug: string }
  | { type: "file"; slug: string; name: string }
  | ({ type: "live"; up: boolean } & Omit<LiveSession, "wt">)
  | { type: "bridge"; slug: string; event: BridgeEvent }
  | { type: "usage"; slug: string; usage: Usage }
  | { type: "limits"; usage: Usage }
  | { type: "belay" }
  | { type: "course"; course: string; path: string }
  | { type: "start"; queue: Queue | null };

type Listener = (e: HubEvent) => void;
type Hub = {
  watchers: FSWatcher[];
  bridges: Map<string, Upstream>;
  listeners: Set<Listener>;
  usage: UsageStore;
  emit: (e: HubEvent) => void;
  ready: Promise<void>;
};

// On globalThis so dev-mode module reloads reuse the hub instead of leaking another one.
const g = globalThis as typeof globalThis & { __belayHub?: Hub };

const READY_TIMEOUT_MS = 2000;
const SESSION_FILES = new Set(["session.json", "bridge.json"]);

function start(): Hub {
  const listeners = new Set<Listener>();
  const bridges = new Map<string, Upstream>();
  const emit = (e: HubEvent) => {
    for (const l of listeners) l(e);
  };

  /** Re-reads the slug's bridge.json under `root` and (re)connects, drops or keeps its upstream to match. */
  const syncBridge = (root: string, slug: string): Promise<void> => {
    const file = readBridgeFile(path.join(root, slug));
    const old = bridges.get(slug);
    if (old && file && sameBridge(old.file, file)) return old.ready;
    if (old) {
      old.close();
      bridges.delete(slug);
      if (old.state().up) emit({ type: "live", slug, up: false, working: false, connected: false, sessionId: null });
    }
    if (!file) return Promise.resolve();
    const up = connectUpstream(file, {
      onEvent: (event) => emit({ type: "bridge", slug, event }),
      onChange: (s) => emit({ type: "live", slug, ...s }),
    });
    bridges.set(slug, up);
    return up.ready;
  };

  const roots = [grillsDir(), lessonsDir()];
  const sessionWatches = roots.map((root) => {
    const w = watch(root, { ignoreInitial: true, depth: 1, ignored: sessionIgnored(root) });
    const onSession = (abs: string) => {
      const hit = locate(root, abs);
      if (!hit) return;
      const [slug, name] = hit;
      if (name === "bridge.json" || name === "") void syncBridge(root, slug);
      if (!name || SESSION_FILES.has(name) || name === `${slug}.md`) emit({ type: "sessions", slug });
      else emit({ type: "file", slug, name });
    };
    for (const ev of ["add", "change", "unlink", "addDir", "unlinkDir"] as const) w.on(ev, onSession);
    return w;
  });
  const data = dataDir();
  const belayWatch = watch(data, { ignoreInitial: true, depth: 1, ignored: belayIgnored(data) });
  for (const ev of ["add", "change", "unlink"] as const) {
    belayWatch.on(ev, (abs) => {
      if (belayWatched(data, abs)) emit({ type: "belay" });
    });
  }

  const learning = learningRoot();
  const courseWatch = watch(learning, { ignoreInitial: true, ignored: courseIgnored(learning) });
  for (const ev of ["add", "change", "unlink", "addDir", "unlinkDir"] as const) {
    courseWatch.on(ev, (abs) => {
      const hit = courseLocate(learning, abs);
      if (hit) emit({ type: "course", course: hit[0], path: hit[1] });
    });
  }

  const watchers = [...sessionWatches, belayWatch, courseWatch];
  for (const w of watchers) w.on("error", (err) => console.error("[belay] watcher:", err));

  // The first page render waits for the existing bridges' first connection attempts, so Live isn't empty.
  const attached = roots.flatMap((root) =>
    existsSync(root)
      ? readdirSync(root).filter((s) => isSlug(s) && existsSync(path.join(root, s, "bridge.json"))).map((s) => syncBridge(root, s))
      : [],
  );
  const initial = Promise.all(attached).then(() => {});
  const ready = Promise.race([initial, new Promise<void>((r) => setTimeout(r, READY_TIMEOUT_MS).unref())]);

  return { watchers, bridges, listeners, usage: new UsageStore(), emit, ready };
}

const hub = () => (g.__belayHub ??= start());

/** Calls `listener` for every hub event; returns the unsubscribe. */
export function subscribeHub(listener: Listener): () => void {
  const { listeners } = hub();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How many pages are open: each holds one `/api/events` stream, subscribed here. */
export function viewerCount(): number {
  return hub().listeners.size;
}

/** The slug's turn in progress, as its bridge last reported it. */
export function openTurn(slug: string): OpenTurn | null {
  return hub().bridges.get(slug)?.turn() ?? null;
}

/** Tells every page the queued lesson start changed. */
export function announceStart(queue: Queue | null) {
  hub().emit({ type: "start", queue });
}

/** A live lesson's last `show`, as its bridge last reported it. */
export function focusFor(slug: string): LessonShow | null {
  return hub().bridges.get(slug)?.focus() ?? null;
}

/** The slug's meters, or null before the status line's first POST. */
export function usageFor(slug: string): Usage | null {
  const h = hub();
  return h.usage.snapshot(h.bridges.get(slug)?.state().sessionId ?? null);
}

/** The account-wide limits, or null before the status line's first POST. */
export function accountUsage(): Usage | null {
  return hub().usage.snapshot(null);
}

// Not a slug, so it can't share a session's resend throttle.
const LIMITS_TARGET = ":limits";

/**
 * Stores one status line payload and sends each live session whose meters it changed its new snapshot, and
 * every page the account's limits. A payload changes its own session's context and cache, and every session's limits.
 */
export function recordUsage(p: StatusLine) {
  const h = hub();
  h.usage.record(p);
  const limits = h.usage.snapshot(null);
  if (limits && h.usage.due(LIMITS_TARGET, limits)) h.emit({ type: "limits", usage: limits });
  for (const [slug, up] of h.bridges) {
    const s = up.state();
    if (!s.up || !s.connected) continue;
    const usage = h.usage.snapshot(s.sessionId);
    if (usage && h.usage.due(slug, usage)) h.emit({ type: "usage", slug, usage });
  }
}

/** Sessions whose bridge stream is open right now. */
export async function liveSessions(): Promise<LiveSession[]> {
  const h = hub();
  await h.ready;
  const out: LiveSession[] = [];
  for (const [slug, up] of h.bridges) {
    const { up: on, working, connected, sessionId } = up.state();
    if (on) out.push({ slug, working, connected, sessionId, wt: up.file.wt });
  }
  return out;
}
