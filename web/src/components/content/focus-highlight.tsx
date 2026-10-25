"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export const FOCUS_EVENT = "belay:focus";

/** Asks the highlight to run now, for a hash on the page already open (`:target` misses `pushState`). */
export function focusHash(hash: string) {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: hash }));
}

/**
 * `:target` doesn't follow client-side navigation, so after each one (and on `belay:focus`) this
 * marks the hash's element with `data-focus` and scrolls it into view.
 */
export function FocusHighlight() {
  const pathname = usePathname();
  const marked = React.useRef<Element | null>(null);

  const mark = React.useCallback((hash: string) => {
    marked.current?.removeAttribute("data-focus");
    marked.current = null;
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.setAttribute("data-focus", "");
    el.scrollIntoView({ block: "start" });
    marked.current = el;
  }, []);

  React.useEffect(() => {
    mark(location.hash);
  }, [pathname, mark]);

  React.useEffect(() => {
    const on = (e: Event) => mark((e as CustomEvent<string | undefined>).detail ?? location.hash);
    window.addEventListener(FOCUS_EVENT, on);
    return () => window.removeEventListener(FOCUS_EVENT, on);
  }, [mark]);

  return null;
}
