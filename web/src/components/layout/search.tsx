"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ProjectMark } from "@/components/project-mark";
import type { Mark, SearchIndex } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import styles from "./search.module.css";

const OPEN = "sear:search";

export const openSearch = () => dispatchEvent(new Event(OPEN));

type Hit = { href: string; mark: Mark | null; name: string; meta: string };

const MAX_HITS = 50;

/** Projects whose key or name matches, then sessions whose slug, topic or project matches, newest first. */
function hits(index: SearchIndex, query: string): Hit[] {
  const q = query.trim().toLowerCase();
  const has = (...fields: (string | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const counts = new Map<string, number>();
  for (const s of index.sessions) if (s.project) counts.set(s.project.key, (counts.get(s.project.key) ?? 0) + 1);
  const projects = index.projects
    .filter((p) => q && has(p.key, p.name))
    .map((p) => ({ href: `/p/${p.key}`, mark: p, name: p.name, meta: `project · ${counts.get(p.key) ?? 0} sessions` }));
  const sessions = index.sessions
    .filter((s) => has(s.slug, s.topic, s.project?.name))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .map((s) => ({
      href: `/s/${s.slug}`,
      mark: s.project,
      name: s.slug,
      meta: [s.project?.key, s.stage, s.updated && shortDate(s.updated)].filter(Boolean).join(" · "),
    }));
  return [...projects, ...sessions].slice(0, MAX_HITS);
}

/**
 * The jump-to palette over every session and project, opened by `openSearch` or Ctrl K / ⌘K anywhere (mock frames
 * re-dispatch their key presses to this document). The index is fetched on first open.
 */
export function SearchPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState<SearchIndex | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [sel, setSel] = React.useState(0);
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
    const show = () => {
      restore.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setSel(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      if (!isOpen.current) restore.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setSel(0);
      setOpen((o) => !o);
    };
    addEventListener(OPEN, show);
    document.addEventListener("keydown", onKey);
    return () => {
      removeEventListener(OPEN, show);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const loading = React.useRef(false);
  React.useEffect(() => {
    if (!open || index || loading.current) return;
    loading.current = true;
    (async () => {
      try {
        const r = await fetch("/api/search", { cache: "no-store" });
        if (!r.ok) throw new Error(`search: ${r.status}`);
        setIndex(await r.json());
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        loading.current = false;
      }
    })();
  }, [open, index]);

  React.useEffect(() => {
    if (!open) return;
    return () => restore.current?.focus?.();
  }, [open]);

  const list = React.useMemo(() => (index ? hits(index, query) : []), [index, query]);
  const listRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const go = (h: Hit | undefined) => {
    if (!h) return;
    setOpen(false);
    router.push(h.href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") setSel((i) => Math.min(list.length - 1, i + 1));
    else if (e.key === "ArrowUp") setSel((i) => Math.max(0, i - 1));
    else if (e.key === "Enter") go(list[sel]);
    else return;
    e.preventDefault();
  };

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className={styles.pal} role="dialog" aria-modal="true" aria-label="Search sessions and projects">
        <label className={styles.in}>
          <Search size={16} aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="search-hits"
            aria-activedescendant={list[sel] ? `search-hit-${sel}` : undefined}
            aria-label="Search"
            placeholder="Jump to a session or project"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        <ul ref={listRef} id="search-hits" className={styles.hits} role="listbox">
          {!index ? (
            <li className={styles.note}>{error ?? "Loading…"}</li>
          ) : list.length === 0 ? (
            <li className={styles.note}>No matches.</li>
          ) : (
            list.map((h, i) => (
              <li
                key={h.href}
                id={`search-hit-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                className={cn(styles.hit, i === sel && styles.on)}
                onMouseMove={() => i !== sel && setSel(i)}
                onClick={() => go(h)}
              >
                <ProjectMark mark={h.mark} />
                <b>{h.name}</b>
                <em>{h.meta}</em>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
