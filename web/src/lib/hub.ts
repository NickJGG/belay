import "server-only";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { dataDir } from "../../../src/config.ts";
import type { OpenTurn } from "./chat";
import { grillDir, searDir } from "./config";
import { isSlug } from "./sessions";
import { connectUpstream, readBridgeFile, sameBridge, type BridgeEvent, type Upstream } from "./upstream";
import { UsageStore, type StatusLine, type Usage } from "./usage";
import { root as learningRoot } from "./courses";
import { belayIgnored, belayWatched, courseIgnored, courseLocate, grillIgnored, locate, searIgnored } from "./watch-paths";

/*
 * The server's one event hub, started by its first user. It watches both session roots and holds an
 * upstream to every attached bridge (a `bridge.json` appearing or changing reconnects it), and fans
 * everything out to `/api/events`:
 *   sessions  a session's session.json, <slug>.md or bridge.json changed, or its folder came or went
 *   file      another file of a Sear session folder changed (chat.jsonl, the mock files)
 *   live      a bridge's stream opened or closed, or its working/connected state changed
 *   bridge    one bridge event, tagged with its session's slug
 *   usage     a live session's meters, from the status line's POST to /api/usage (matched by the bridge's sessionId)
 *   belay     an issue, project, log day or order.yaml in belay's data dir changed (by a page, the CLI or Claude)
 *   course    a visible file of a course folder changed (see `visibleParts`), as `{course, path}`
 */

export type LiveSession = { slug: string; working: boolean; connected: boolean; sessionId: string | null };

export type HubEvent =
  | { type: "sessions"; slug: string }
  | { type: "file"; slug: string; name: string }
  | ({ type: "live"; up: boolean } & LiveSession)
  | { type: "bridge"; slug: string; event: BridgeEvent }
  | { type: "usage"; slug: string; usage: Usage }
  | { type: "belay" }
  | { type: "course"; course: string; path: string };

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
const g = globalThis as typeof globalThis & { __searHub?: Hub };

const READY_TIMEOUT_MS = 2000;
const SESSION_FILES = new Set(["session.json", "bridge.json"]);

function start(): Hub {
  const listeners = new Set<Listener>();
  const bridges = new Map<string, Upstream>();
  const emit = (e: HubEvent) => {
    for (const l of listeners) l(e);
  };

  /** Re-reads the slug's bridge.json and (re)connects, drops or keeps its upstream to match. */
  const syncBridge = (slug: string): Promise<void> => {
    const file = readBridgeFile(path.join(searDir(), slug));
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

  const sear = searDir();
  const searWatch = watch(sear, { ignoreInitial: true, depth: 1, ignored: searIgnored(sear) });
  const onSear = (abs: string) => {
    const hit = locate(sear, abs);
    if (!hit) return;
    const [slug, name] = hit;
    if (name === "bridge.json" || name === "") void syncBridge(slug);
    if (!name || SESSION_FILES.has(name) || name === `${slug}.md`) emit({ type: "sessions", slug });
    else emit({ type: "file", slug, name });
  };

  const grill = grillDir();
  const grillWatch = watch(grill, { ignoreInitial: true, depth: 1, ignored: grillIgnored(grill) });
  const onGrill = (abs: string) => {
    const hit = locate(grill, abs);
    if (hit && (!hit[1] || hit[1] === `${hit[0]}.md`)) emit({ type: "sessions", slug: hit[0] });
  };

  for (const ev of ["add", "change", "unlink", "addDir", "unlinkDir"] as const) {
    searWatch.on(ev, onSear);
    grillWatch.on(ev, onGrill);
  }
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

  const watchers = [searWatch, grillWatch, belayWatch, courseWatch];
  for (const w of watchers) w.on("error", (err) => console.error("[sear] watcher:", err));

  // The first page render waits for the existing bridges' first connection attempts, so Live isn't empty.
  const attached = existsSync(sear)
    ? readdirSync(sear).filter((s) => isSlug(s) && existsSync(path.join(sear, s, "bridge.json")))
    : [];
  const initial = Promise.all(attached.map(syncBridge)).then(() => {});
  const ready = Promise.race([initial, new Promise<void>((r) => setTimeout(r, READY_TIMEOUT_MS).unref())]);

  return { watchers, bridges, listeners, usage: new UsageStore(), emit, ready };
}

const hub = () => (g.__searHub ??= start());

/** Calls `listener` for every hub event; returns the unsubscribe. */
export function subscribeHub(listener: Listener): () => void {
  const { listeners } = hub();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The slug's turn in progress, as its bridge last reported it. */
export function openTurn(slug: string): OpenTurn | null {
  return hub().bridges.get(slug)?.turn() ?? null;
}

/** The slug's meters, or null before the status line's first POST. */
export function usageFor(slug: string): Usage | null {
  const h = hub();
  return h.usage.snapshot(h.bridges.get(slug)?.state().sessionId ?? null);
}

/**
 * Stores one status line payload and sends each live session whose meters it changed its new snapshot. A
 * payload changes its own session's context and cache, and every session's limits.
 */
export function recordUsage(p: StatusLine) {
  const h = hub();
  h.usage.record(p);
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
    if (on) out.push({ slug, working, connected, sessionId });
  }
  return out;
}
