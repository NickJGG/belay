"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LinkState, PendingComment, Send } from "@/components/session/drawer";
import { applyResult, toStep, type ChatEntry, type OpenTurn } from "@/lib/chat";
import type { DrawerSeed, LiveItem } from "@/lib/data";
import { DRAWER_DEFAULTS, DRAWER_KEY, parseDrawer, selectTab, sessionSlug, TAB_KEY, type DrawerPrefs } from "@/lib/shell";
import type { Usage } from "@/lib/usage";
import { subscribeLive } from "./event-hub";

type Live = {
  live: LiveItem[];
  /** The Tab the Drawer shows; null while nothing is live. */
  selected: LiveItem | null;
  /** Selects a Tab; its link opens the grill. */
  select: (slug: string) => void;
  chat: ChatEntry[];
  turn: OpenTurn | null;
  usage: Usage | null;
  link: LinkState;
  send: Send;
  drawer: DrawerPrefs;
  setDrawer: (p: Partial<DrawerPrefs> | ((p: DrawerPrefs) => Partial<DrawerPrefs>)) => void;
  /** The narrow layout's full-screen Drawer, opened from the Strip. */
  sheet: boolean;
  setSheet: (open: boolean) => void;
  /** A comment pinned on the selected grill's mock, waiting for its text in the Drawer. */
  comment: PendingComment | null;
  setComment: (c: PendingComment | null) => void;
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

/** The live Tabs, the one the Drawer shows, and its conversation kept current from the event stream. */
export function LiveProvider({ live, seeds, children }: { live: LiveItem[]; seeds: Record<string, DrawerSeed>; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const page = sessionSlug(pathname);

  const [last, setLast] = React.useState<string | null>(null);
  const [drawer, setDrawerState] = React.useState<DrawerPrefs>(DRAWER_DEFAULTS);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
    setLast(read(TAB_KEY));
    setDrawerState(parseDrawer(read(DRAWER_KEY)));
  }, []);

  const slug = selectTab(
    live.map((l) => l.slug),
    page,
    last,
  );
  const selected = live.find((l) => l.slug === slug) ?? null;

  const select = (s: string) => {
    setLast(s);
    write(TAB_KEY, s);
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

  // The selected grill's conversation: fetched when the selection changes, then re-read whenever chat.jsonl does.
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

  const [comment, setComment] = React.useState<PendingComment | null>(null);
  const [commentFor, setCommentFor] = React.useState(slug);
  if (commentFor !== slug) {
    setCommentFor(slug);
    setComment(null);
  }

  const send: Send = React.useCallback((msg) => (slug ? sendTo(slug, msg) : Promise.resolve("No grill selected")), [slug]);
  const link: LinkState = !selected ? { state: "offline" } : selected.connected ? { state: "connected", working: selected.working } : { state: "disconnected" };

  const value: Live = {
    live,
    selected,
    select,
    chat: chat.slug === slug ? chat.entries : [],
    turn: turn.slug === slug ? turn.turn : null,
    usage: usage.slug === slug ? usage.usage : null,
    link,
    send,
    drawer,
    setDrawer,
    sheet,
    setSheet,
    comment,
    setComment,
  };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
