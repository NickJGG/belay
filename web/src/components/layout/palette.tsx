"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { ArrowRight, Blend, FilePlus, NotebookPen, Search, SquareTerminal } from "lucide-react";
import { requestIntent, type Intent } from "@/components/belay/intents";
import { StatusIcon } from "@/components/belay/status-icon";
import { useLive } from "@/components/live/live-provider";
import { ProjectMark } from "@/components/project-mark";
import type { SearchIndex } from "@/lib/data";
import { activeClientSlots } from "@/lib/extensions.client";
import { issueHref, projectHref, UNFILED } from "@/lib/hrefs";
import { setGlow, useGlow } from "./ambient-glow";
import { tabTitle } from "./live-tabs";
import { useSlot } from "./shell-slot";
import { useNav } from "./site-nav";
import styles from "./palette.module.css";

const OPEN = "belay:search";

export const openPalette = () => dispatchEvent(new Event(OPEN));

/** A command the open page offers, listed first (an issue's status keys and !, a grill's resume command). */
export type PageCommand = { id: string; label: string; icon?: React.ReactNode; shortcut?: string; run: () => void };

export type PageCommandGroup = { heading: string; items: PageCommand[] };

const CommandsContext = React.createContext<(c: PageCommandGroup | null) => void>(() => {});

/** Holds the open page's commands and renders the palette, which needs them and the shell's slot. */
export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [commands, setCommands] = React.useState<PageCommandGroup | null>(null);
  return (
    <CommandsContext.Provider value={setCommands}>
      {children}
      <Palette commands={commands} />
    </CommandsContext.Provider>
  );
}

/** Rendered by a page to list its commands first in the palette while it's open. */
export function PageCommands({ heading, items }: PageCommandGroup) {
  const set = React.useContext(CommandsContext);
  React.useEffect(() => {
    set({ heading, items });
  }, [set, heading, items]);
  React.useEffect(() => () => set(null), [set]);
  return null;
}

const ACTIONS: { intent: Intent; label: string; icon: React.ReactNode; section: string }[] = [
  { intent: "new-issue", label: "New issue", icon: <FilePlus size={14} aria-hidden />, section: "" },
  { intent: "log", label: "Log what you did", icon: <NotebookPen size={14} aria-hidden />, section: "/logs" },
];

/**
 * Belay's command palette, opened by `openPalette` or Ctrl K / ⌘K anywhere (mock frames re-dispatch
 * their key presses to this document): the open page's commands, Actions in the open project, Go to (the app nav), then
 * projects and the active extensions' groups, and once there's a query, issues and the extensions' names. The names
 * are fetched afresh on each opening.
 */
function Palette({ commands }: { commands: PageCommandGroup | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const slot = useSlot();
  const { selected, focusTerminal, active } = useLive();
  const nav = useNav();
  const { resolvedTheme } = useTheme();
  const glow = useGlow();
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState<SearchIndex | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  // An action with no project open asks for one first.
  const [choosing, setChoosing] = React.useState<(typeof ACTIONS)[number] | null>(null);
  const [openFor, setOpenFor] = React.useState(pathname);
  if (openFor !== pathname) {
    setOpenFor(pathname);
    setOpen(false);
  }

  // Taken before opening: by the first effect after, the input's autoFocus has moved focus.
  const restore = React.useRef<HTMLElement | null>(null);
  const isOpen = React.useRef(open);
  React.useEffect(() => {
    isOpen.current = open;
  });
  React.useEffect(() => {
    const show = (toggle: boolean) => {
      if (!isOpen.current) restore.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setChoosing(null);
      setOpen((o) => (toggle ? !o : true));
    };
    const onOpen = () => show(false);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      show(true);
    };
    addEventListener(OPEN, onOpen);
    document.addEventListener("keydown", onKey);
    return () => {
      removeEventListener(OPEN, onOpen);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/search", { cache: "no-store" });
        if (!r.ok) throw new Error(`search: ${r.status}`);
        const next = (await r.json()) as SearchIndex;
        if (!cancelled) {
          setIndex(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    return () => restore.current?.focus?.();
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const go = (href: string) => run(() => router.push(href));
  const act = (a: (typeof ACTIONS)[number], key: string) =>
    run(() => {
      requestIntent(a.intent, key);
      const href = projectHref(key, a.section);
      if (pathname !== href) router.push(href);
    });
  const here = slot.project && slot.project.key !== UNFILED ? slot.project : null;
  const slots = activeClientSlots(active);
  const searching = query.trim() !== "";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (choosing) {
        setChoosing(null);
        setQuery("");
      } else close();
    } else if (e.key === "Backspace" && choosing && !query) {
      e.preventDefault();
      setChoosing(null);
    }
  };

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Command className={styles.pal} label="Command palette" loop onKeyDown={onKeyDown}>
        <label className={styles.in}>
          <Search size={16} aria-hidden />
          {choosing ? <span className={styles.crumb}>{choosing.label} in</span> : null}
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={choosing ? "Choose a project…" : "Type a command or search…"}
          />
        </label>
        <Command.List className={styles.hits}>
          <Command.Empty className={styles.note}>{index ? "No results." : (error ?? "Loading…")}</Command.Empty>
          {choosing ? (
            <Command.Group heading="Projects" className={styles.group}>
              {index?.projects
                .filter((p) => p.status === "active")
                .map((p) => (
                  <Command.Item key={p.key} value={`project ${p.key} ${p.name}`} className={styles.hit} onSelect={act(choosing, p.key)}>
                    <ProjectMark mark={p} />
                    <b>{p.name}</b>
                    <em>{p.key}</em>
                  </Command.Item>
                ))}
            </Command.Group>
          ) : (
            <>
              {commands?.items.length ? (
                <Command.Group heading={commands.heading} className={styles.group}>
                  {commands.items.map((c) => (
                    <Command.Item key={c.id} value={`page ${c.id} ${c.label}`} className={styles.hit} onSelect={run(c.run)}>
                      {c.icon}
                      <b>{c.label}</b>
                      {c.shortcut ? <kbd>{c.shortcut}</kbd> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Actions" className={styles.group}>
                {ACTIONS.map((a) => (
                  <Command.Item
                    key={a.intent}
                    value={`action ${a.label}`}
                    className={styles.hit}
                    onSelect={
                      here
                        ? act(a, here.key)
                        : () => {
                            setQuery("");
                            setChoosing(a);
                          }
                    }
                  >
                    {a.icon}
                    <b>{here ? a.label : `${a.label}…`}</b>
                    {here ? <em>{here.name}</em> : null}
                  </Command.Item>
                ))}
                {selected?.wt ? (
                  <Command.Item value="action Go to the terminal tab" className={styles.hit} onSelect={run(focusTerminal)}>
                    <SquareTerminal size={14} aria-hidden />
                    <b>Go to the terminal tab</b>
                    <em>{tabTitle(selected)}</em>
                  </Command.Item>
                ) : null}
                {resolvedTheme === "dark" ? (
                  <Command.Item value="action Toggle background glow" className={styles.hit} onSelect={run(() => setGlow(!glow))}>
                    <Blend size={14} aria-hidden />
                    <b>{glow ? "Turn off background glow" : "Turn on background glow"}</b>
                  </Command.Item>
                ) : null}
              </Command.Group>
              <Command.Group heading="Go to" className={styles.group}>
                {nav.map((g) => (
                  <Command.Item key={g.href} value={`go ${g.label}`} className={styles.hit} onSelect={go(g.href)}>
                    <ArrowRight size={14} aria-hidden />
                    <b>{g.label}</b>
                  </Command.Item>
                ))}
              </Command.Group>
              {index ? (
                <Command.Group heading="Projects" className={styles.group}>
                  {index.projects.map((p) => (
                    <Command.Item key={p.key} value={`project ${p.key} ${p.name}`} className={styles.hit} onSelect={go(projectHref(p.key))}>
                      <ProjectMark mark={p} />
                      <b>{p.name}</b>
                      <em>{p.status === "active" ? p.key : `${p.key} · ${p.status}`}</em>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {index ? slots.map((x) => (x.Browse ? <x.Browse key={x.id} index={index} go={go} /> : null)) : null}
              {/* Hundreds of issues, grills and notes would bury everything else, so they appear only once there's a query. */}
              {index && searching ? (
                <>
                  <Command.Group heading="Issues" className={styles.group}>
                    {index.issues.map((t) => (
                      <Command.Item key={t.id} value={`issue ${t.id} ${t.title}`} className={styles.hit} onSelect={go(issueHref(t.id))}>
                        <StatusIcon status={t.status} />
                        <b>{t.title}</b>
                        <em>{t.id}</em>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  {slots.map((x) => (x.Found ? <x.Found key={x.id} index={index} go={go} /> : null))}
                </>
              ) : null}
            </>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
