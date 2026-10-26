"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, BookOpen, CircleAlert, FilePlus, FileText, GraduationCap, NotebookPen, Search, SquareTerminal } from "lucide-react";
import { requestIntent, type Intent } from "@/components/belay/intents";
import { StatusIcon } from "@/components/belay/status-icon";
import { useLive } from "@/components/live/live-provider";
import { ProjectMark } from "@/components/project-mark";
import type { SearchIndex } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { courseHref, grillHref, issueHref, projectHref, UNFILED } from "@/lib/hrefs";
import { tabTitle } from "./live-tabs";
import { Mark } from "./logo";
import { useSlot } from "./shell-slot";
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

const CourseMark = ({ color }: { color: string }) => (
  <span style={{ "--hue": color } as React.CSSProperties}>
    <Mark tone="current" className={styles.courseMark} />
  </span>
);

const GO_TO = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/p" },
  { label: "Courses", href: "/courses" },
];

const ACTIONS: { intent: Intent; label: string; icon: React.ReactNode; section: string }[] = [
  { intent: "new-issue", label: "New issue", icon: <FilePlus size={14} aria-hidden />, section: "" },
  { intent: "log", label: "Log what you did", icon: <NotebookPen size={14} aria-hidden />, section: "/logs" },
];

/**
 * Belay's command palette, opened by `openPalette` or Ctrl K / ⌘K anywhere (mock frames re-dispatch
 * their key presses to this document): the open page's commands, Actions in the open project, Go to, then projects
 * and courses, and once there's a query, issues, grills, lessons, notes, sources and misconceptions by name. The names
 * are fetched afresh on each opening.
 */
function Palette({ commands }: { commands: PageCommandGroup | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const slot = useSlot();
  const { selected, focusTerminal } = useLive();
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
              </Command.Group>
              <Command.Group heading="Go to" className={styles.group}>
                {GO_TO.map((g) => (
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
              {index?.courses.length ? (
                <Command.Group heading="Courses" className={styles.group}>
                  {index.courses.map((c) => (
                    <Command.Item key={c.course} value={`course ${c.course} ${c.title}`} className={styles.hit} onSelect={go(courseHref(c.course))}>
                      <CourseMark color={c.color} />
                      <b>{c.title}</b>
                      <em>{c.course}</em>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
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
                  <Command.Group heading="Grills" className={styles.group}>
                    {index.sessions.map((s) => (
                      <Command.Item key={s.slug} value={`grill ${s.slug} ${s.topic}`} className={styles.hit} onSelect={go(grillHref(s.slug))}>
                        <ProjectMark mark={s.project} />
                        <b>{s.topic}</b>
                        <em>{[s.slug, s.stage].join(" · ")}</em>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Lessons" className={styles.group}>
                    {index.lessons.map((l) => (
                      <Command.Item
                        key={`${l.course}/${l.slug}`}
                        value={`lesson ${l.course} ${l.slug} ${l.title}`}
                        className={styles.hit}
                        onSelect={go(courseHref(l.course, `/lessons/${l.slug}`))}
                      >
                        <GraduationCap size={14} aria-hidden />
                        <b>{l.title}</b>
                        <em>{`${l.courseTitle} · ${shortDate(l.date)}`}</em>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Notes" className={styles.group}>
                    {index.notes.map((n) => (
                      <Command.Item
                        key={`${n.course}/${n.slug}`}
                        value={`note ${n.course} ${n.slug} ${n.title}`}
                        className={styles.hit}
                        onSelect={go(courseHref(n.course, `/knowledge/${n.slug}`))}
                      >
                        <FileText size={14} aria-hidden />
                        <b>{n.title}</b>
                        <em>{n.slug}</em>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Sources" className={styles.group}>
                    {index.sources.map((s) => (
                      <Command.Item
                        key={`${s.course}/${s.id}`}
                        value={`source ${s.course} ${s.id} ${s.title}`}
                        className={styles.hit}
                        onSelect={go(courseHref(s.course, `/sources/${s.id}`))}
                      >
                        <BookOpen size={14} aria-hidden />
                        <b>{s.title}</b>
                        <em>{s.id}</em>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Misconceptions" className={styles.group}>
                    {index.misconceptions.map((m, i) => (
                      <Command.Item
                        key={`${m.course}/${i}`}
                        value={`misconception ${m.course} ${m.topic} ${m.claim}`}
                        className={styles.hit}
                        onSelect={go(courseHref(m.course, "/misconceptions"))}
                      >
                        <CircleAlert size={14} aria-hidden />
                        <b>{m.claim}</b>
                        <em>{m.topic}</em>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              ) : null}
            </>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
