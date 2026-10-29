"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLesson } from "./lesson-state";
import { focusHash } from "@/components/content/focus-highlight";
import { isLesson, showKey, showPage } from "../_lib/lesson";
import { useLive } from "@/components/live/live-provider";
import styles from "./follow.module.css";

/*
 * Follow along for a live lesson: the main column keeps the lesson's last `show` on screen. A new
 * show navigates there while following; the learner navigating or scrolling the page pauses it, and Follow jumps
 * back. A show that lands while something is being written (the Drawer's composer, a work file, a note) waits in the
 * pill instead, since the jump would discard it.
 */

/** The page part of an href, decoded, for comparing with `usePathname()` or `location.pathname`. */
const pagePath = (href: string) => decodeURI(href.split("#")[0]);

const SCROLL_KEYS = new Set(["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " "]);
const NOT_PAGE = "input, textarea, select, [contenteditable], aside, [role=dialog]";

/** Whether the learner is writing something a navigation would throw away. */
function writing(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value.trim() !== "";
  return el instanceof HTMLElement && el.isContentEditable;
}

export function FollowAlong() {
  const { sheet, selected } = useLive();
  const { focus } = useLesson();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [following, setFollowing] = React.useState(true);
  const seen = React.useRef<string | null | undefined>(undefined);
  // The page Follow along is navigating to, so arriving there isn't taken for wandering.
  const expected = React.useRef<string | null>(null);
  const lastPath = React.useRef(pathname);
  const page = focus ? showPage(focus, selected && isLesson(selected) ? selected.titles : undefined) : null;

  const go = React.useCallback(
    (href: string) => {
      const hash = href.includes("#") ? `#${href.split("#")[1]}` : "";
      if (pagePath(href) === decodeURI(location.pathname)) {
        // router.push doubles the hash when the URL already carries one (`#c4#c4`).
        if (hash) {
          if (location.hash !== hash) history.pushState(null, "", hash);
          focusHash(hash);
        }
        return;
      }
      expected.current = pagePath(href);
      router.push(href);
    },
    [router],
  );

  // The first show seen (the page's seed) is where Claude already was; only later ones move the page.
  React.useEffect(() => {
    const key = focus ? showKey(focus) : null;
    const prev = seen.current;
    seen.current = key;
    if (!page || prev === undefined || prev === key) return;
    if (following && !writing()) go(page.href);
  }, [focus, page, following, go]);

  React.useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    const ours = expected.current === decodeURI(pathname);
    expected.current = null;
    if (!ours) setFollowing(false);
  }, [pathname]);

  const watching = !!page && following;
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (!watching || !main) return;
    const wander = () => {
      if (sheet) return;
      setFollowing(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(NOT_PAGE)) return;
      wander();
    };
    main.addEventListener("wheel", wander, { passive: true });
    main.addEventListener("touchmove", wander, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      main.removeEventListener("wheel", wander);
      main.removeEventListener("touchmove", wander);
      window.removeEventListener("keydown", onKey);
    };
  }, [watching, sheet]);

  if (!page) return null;
  const here = following && pagePath(page.href) === decodeURI(pathname);
  return (
    <div className={styles.dock} role="status">
      {here ? (
        <button type="button" className={styles.quiet} onClick={() => setFollowing(false)} title="Stop following">
          <i className={styles.dot} aria-hidden />
          Following Claude
        </button>
      ) : (
        <div className={styles.pill}>
          <i className={styles.dot} aria-hidden />
          <span title={page.title}>Claude is on {page.label}</span>
          <button
            type="button"
            onClick={() => {
              setFollowing(true);
              go(page.href);
            }}
          >
            Follow
          </button>
        </div>
      )}
    </div>
  );
}
