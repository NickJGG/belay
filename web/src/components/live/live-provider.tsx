"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { toastError } from "@/components/belay/toaster";
import type { LinkState, Send } from "@/components/session/drawer";
import { applyResult, toStep, type ChatEntry, type OpenTurn } from "@/lib/chat";
import type { DrawerSeed, LiveItem } from "@/lib/data";
import { activeClientKinds, CLIENT_KINDS } from "@/lib/extensions.client";
import type { ClientKind } from "@/lib/session-kind";
import { DRAWER_DEFAULTS, DRAWER_KEY, fresh as freshTabs, markSeen, moveTab, orderTabs, pageTab, parseDrawer, parseSeen, parseTabOrder, SEEN_KEY, selectTab, TAB_KEY, TABS_KEY, type DrawerPrefs } from "@/lib/shell";
import type { Usage } from "@/lib/usage";
import type { ExtensionId } from "../../../../src/extension-ids.ts";
import { subscribeLive } from "./event-hub";

type Live = {
  /** In this browser's stored order. */
  live: LiveItem[];
  /** The Tab the Drawer shows; null while nothing is live. */
  selected: LiveItem | null;
  /** Selects a Tab; its link opens the grill. */
  select: (slug: string) => void;
  /** Drops a Tab at index `to` of `live`, and stores the order. */
  move: (slug: string, to: number) => void;
  /** Tabs not yet opened in this browser. */
  fresh: Set<string>;
  chat: ChatEntry[];
  turn: OpenTurn | null;
  usage: Usage | null;
  link: LinkState;
  send: Send;
  /** Raises the selected Tab's Windows Terminal tab (only offered when it has `wt`); a miss toasts why. */
  focusTerminal: () => void;
  drawer: DrawerPrefs;
  setDrawer: (p: Partial<DrawerPrefs> | ((p: DrawerPrefs) => Partial<DrawerPrefs>)) => void;
  /** The narrow layout's full-screen Drawer, opened from the Strip. */
  sheet: boolean;
  setSheet: (open: boolean) => void;
  /** The selected Tab's seed from the server, for the state its kind keeps. */
  seed: DrawerSeed | undefined;
  /** The active extensions, and their session kinds, in built-in order. */
  active: ExtensionId[];
  kinds: ClientKind[];
};

const LiveContext = React.createContext<Live | null>(null);

export function useLive(): Live {
  const v = React.useContext(LiveContext);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export async function sendTo(slug: string, msg: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(`/api/s/${slug}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return (j as { error?: string }).error ?? `Failed (${r.status})`;
  } catch (err) {
    return (err as Error).message;
  }
}

// TEMP: usage-blank diagnosis; remove with the fix.
const trail: string[] = [];
function usageTrail(line: string) {
  trail.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
  if (trail.length > 30) trail.shift();
}

/** The live Tabs, the one the Drawer shows, and its conversation kept current from the event stream. */
export function LiveProvider({
  live: incoming,
  seeds,
  active,
  children,
}: {
  live: LiveItem[];
  seeds: Record<string, DrawerSeed>;
  active: ExtensionId[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  const [last, setLast] = React.useState<string | null>(null);
  const [order, setOrder] = React.useState<string[]>([]);
  const [drawer, setDrawerState] = React.useState<DrawerPrefs>(DRAWER_DEFAULTS);
  // Null until read, so nothing renders New before this browser's list is known.
  const [seen, setSeen] = React.useState<string[] | null>(null);
  const firstLive = React.useRef(incoming);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
    setLast(read(TAB_KEY));
    setOrder(parseTabOrder(read(TABS_KEY)));
    setDrawerState(parseDrawer(read(DRAWER_KEY)));
    let saved = parseSeen(read(SEEN_KEY));
    // A first visit counts what's already live as seen, so a new browser doesn't mark everything New.
    if (!saved) {
      saved = firstLive.current.map((l) => l.slug);
      write(SEEN_KEY, JSON.stringify(saved));
    }
    setSeen(saved);
  }, []);

  const live = React.useMemo(() => {
    const bySlug = new Map(incoming.map((l) => [l.slug, l]));
    return orderTabs([...bySlug.keys()], order).map((s) => bySlug.get(s)!);
  }, [incoming, order]);
  const page = pageTab(pathname, live, active);

  const slug = selectTab(
    live.map((l) => l.slug),
    page,
    last,
  );
  const selected = live.find((l) => l.slug === slug) ?? null;

  const liveSlugs = live.map((l) => l.slug);
  // Being on a Tab's page opens it too.
  React.useEffect(() => {
    if (!page || !seen || seen.includes(page) || !live.some((l) => l.slug === page)) return;
    const next = markSeen(seen, live.map((l) => l.slug), page);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the page into localStorage-backed state
    setSeen(next);
    write(SEEN_KEY, JSON.stringify(next));
  }, [page, seen, live]);

  const select = (s: string) => {
    setLast(s);
    write(TAB_KEY, s);
    if (seen && seen.at(-1) !== s) {
      const next = markSeen(seen, liveSlugs, s);
      setSeen(next);
      write(SEEN_KEY, JSON.stringify(next));
    }
  };

  const move = (s: string, to: number) => {
    const next = moveTab(order, liveSlugs, s, to);
    setOrder(next);
    write(TABS_KEY, JSON.stringify(next));
  };

  const setDrawer = (p: Partial<DrawerPrefs> | ((p: DrawerPrefs) => Partial<DrawerPrefs>)) =>
    setDrawerState((d) => {
      const next = { ...d, ...(typeof p === "function" ? p(d) : p) };
      write(DRAWER_KEY, JSON.stringify(next));
      return next;
    });

  const [sheet, setSheet] = React.useState(false);
  const [sheetFor, setSheetFor] = React.useState(pathname);
  if (sheetFor !== pathname) {
    setSheetFor(pathname);
    setSheet(false);
  }

  // The selected session's conversation: fetched when the selection changes, then re-read whenever chat.jsonl does.
  const [chat, setChat] = React.useState<{ slug: string | null; entries: ChatEntry[] }>({ slug: null, entries: [] });
  const seed = slug ? seeds[slug] : undefined;
  const [turn, setTurn] = React.useState<{ slug: string | null; turn: OpenTurn | null }>({ slug, turn: seed?.turn ?? null });
  const [usage, setUsage] = React.useState<{ slug: string | null; usage: Usage | null }>({ slug, usage: seed?.usage ?? null });
  // A new selection, or a refresh that brings the server's copy, starts from the seed.
  const [seedFor, setSeedFor] = React.useState({ slug, seed });
  if (seedFor.slug !== slug || seedFor.seed !== seed) {
    setSeedFor({ slug, seed });
    setTurn({ slug, turn: seed?.turn ?? null });
    setUsage({ slug, usage: seed?.usage ?? null });
  }

  React.useEffect(() => {
    if (!slug) return;
    let alive = true;
    const reload = async () => {
      try {
        const r = await fetch(`/api/s/${slug}/chat`, { cache: "no-store" });
        if (r.ok && alive) setChat({ slug, entries: await r.json() });
      } catch {}
    };
    void reload();
    const unsubscribe = subscribeLive((e) => {
      // TEMP: usage-blank diagnosis; remove with the fix.
      if (e.type === "usage") usageTrail(`usage event for ${e.slug} (listener slug ${slug}) limits=${e.usage.fiveHour ? "yes" : "null"}`);
      else if (e.type === "reconnect" || e.type === "live" || e.type === "sessions") usageTrail(`${e.type}${"slug" in e ? ` ${e.slug}` : ""}`);
      if (e.type === "reconnect") {
        // Steps sent while the stream was down are lost; the refresh that follows brings the server's turn.
        setTurn({ slug, turn: null });
        return void reload();
      }
      if (e.type === "usage" && e.slug === slug) return setUsage({ slug, usage: e.usage });
      if (e.type === "file" && e.slug === slug && e.name === "chat.jsonl") return void reload();
      if (e.type !== "bridge" || e.slug !== slug) return;
      const ev = e.event;
      if (ev.type === "steps") return setTurn({ slug, turn: { start: String(ev.start), steps: Array.isArray(ev.steps) ? ev.steps.map(toStep) : [] } });
      if (ev.type === "step") {
        const step = toStep(ev);
        return setTurn((t) => ({ slug, turn: t.turn ? { ...t.turn, steps: [...t.turn.steps, step] } : { start: step.at, steps: [step] } }));
      }
      if (ev.type === "result") return setTurn((t) => ({ slug, turn: t.turn ? applyResult(t.turn, ev) : t.turn }));
      // The folded group arrives with chat.jsonl's file event.
      if (ev.type === "turn") return setTurn({ slug, turn: null });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [slug]);

  const send: Send = React.useCallback((msg) => (slug ? sendTo(slug, msg) : Promise.resolve("Nothing live is selected")), [slug]);
  const focusTerminal = React.useCallback(() => void send({ kind: "focus" }).then((err) => err && toastError(err)), [send]);
  const link: LinkState = !selected ? { state: "offline" } : selected.connected ? { state: "connected", working: selected.working } : { state: "disconnected" };

  // TEMP: usage-blank diagnosis; remove with the fix.
  const shownUsage = usage.slug === slug ? usage.usage : null;
  React.useEffect(() => {
    usageTrail(`seed for ${slug}: ${seed ? (seed.usage ? "usage" : "usage null") : "missing"}; seeds=[${Object.keys(seeds).join(",")}]`);
  }, [seed, seeds, slug]);
  React.useEffect(() => {
    usageTrail(`shown slug=${slug} usage.slug=${usage.slug} usage=${usage.usage ? "yes" : "null"} link=${link.state}`);
    if (link.state === "connected" && !shownUsage) {
      console.warn("[belay usage-blank]", { slug, usageSlug: usage.slug, hasUsage: !!usage.usage, seedKeys: Object.keys(seeds), seed, trail: [...trail] });
    }
  }, [slug, usage, shownUsage, link.state, seeds, seed]);

  // Each server render sends a new array, so the ids keep these stable across refreshes.
  const ids = active.join(",");
  const stableActive = React.useMemo(() => (ids ? (ids.split(",") as ExtensionId[]) : []), [ids]);
  const kinds = React.useMemo(() => activeClientKinds(stableActive), [stableActive]);
  const value: Live = {
    live,
    selected,
    select,
    move,
    fresh: new Set(seen ? freshTabs(liveSlugs, seen) : []),
    chat: chat.slug === slug ? chat.entries : [],
    turn: turn.slug === slug ? turn.turn : null,
    usage: usage.slug === slug ? usage.usage : null,
    link,
    send,
    focusTerminal,
    drawer,
    setDrawer,
    sheet,
    setSheet,
    seed,
    active: stableActive,
    kinds,
  };
  // Every built-in kind's state stays mounted, so switching one doesn't remount the page under it.
  const inner = CLIENT_KINDS.reduceRight<React.ReactNode>((c, k) => (k.Provider ? <k.Provider>{c}</k.Provider> : c), children);
  return <LiveContext.Provider value={value}>{inner}</LiveContext.Provider>;
}
