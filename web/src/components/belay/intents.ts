"use client";

import * as React from "react";

/** A form the palette asks a project page to open: New issue on Issues, the composer on Logs. */
export type Intent = "new-issue" | "log";

const KEY = "belay:intent";

/**
 * Asks `project`'s page to open the form. Kept in sessionStorage for a page the palette is about to navigate to,
 * and announced at once for one already open.
 */
export function requestIntent(intent: Intent, project: string) {
  const want = `${intent}:${project}`;
  try {
    sessionStorage.setItem(KEY, want);
  } catch {}
  dispatchEvent(new CustomEvent(KEY, { detail: want }));
}

/** Runs `fn` when the palette asks this page's form (`intent` in `project`) to open. */
export function useIntent(intent: Intent, project: string, fn: () => void) {
  const run = React.useEffectEvent(fn);
  React.useEffect(() => {
    const want = `${intent}:${project}`;
    const take = () => {
      let pending: string | null = null;
      try {
        pending = sessionStorage.getItem(KEY);
        if (pending === want) sessionStorage.removeItem(KEY);
      } catch {}
      if (pending === want) run();
    };
    take();
    addEventListener(KEY, take);
    return () => removeEventListener(KEY, take);
  }, [intent, project]);
}
