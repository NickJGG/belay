"use client";

import * as React from "react";
import { subscribeLive } from "@/components/live/event-hub";
import { useLive } from "@/components/live/live-provider";
import { toShow, type LessonShow } from "@/app/(browse)/(learn)/_lib/lesson";
import type { Queue } from "@/app/(browse)/(learn)/_lib/start-queue";

type LessonState = {
  /** The selected lesson's last `show`, for Follow along; null for a grill. */
  focus: LessonShow | null;
  /** The lesson start waiting for a fresh session (`/api/lesson/start`), on every page. */
  start: Queue | null;
};

const LessonContext = React.createContext<LessonState>({ focus: null, start: null });

/** The selected lesson's focus, from its seed and then its bridge's `show` events, and the start queue. */
export function LessonProvider({ children }: { children: React.ReactNode }) {
  const { selected, seed, active } = useLive();
  const on = active.includes("learn");
  const slug = selected?.slug ?? null;

  const [focus, setFocus] = React.useState<{ slug: string | null; focus: LessonShow | null }>({ slug, focus: seed?.focus ?? null });
  // A new selection, or a refresh that brings the server's copy, starts from the seed.
  const [seedFor, setSeedFor] = React.useState({ slug, seed });
  if (seedFor.slug !== slug || seedFor.seed !== seed) {
    setSeedFor({ slug, seed });
    setFocus({ slug, focus: seed?.focus ?? null });
  }

  React.useEffect(() => {
    if (!slug) return;
    return subscribeLive((e) => {
      if (e.type !== "bridge" || e.slug !== slug || e.event.type !== "show") return;
      const f = toShow(e.event);
      if (f) setFocus({ slug, focus: f });
    });
  }, [slug]);

  const [start, setStart] = React.useState<Queue | null>(null);
  // Mounted whether learn is on or not, so only an active learn asks for the queue.
  React.useEffect(() => {
    if (!on) return;
    let alive = true;
    const reload = () =>
      fetch("/api/lesson/start", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((q: Queue | null) => alive && setStart(q))
        .catch(() => {});
    void reload();
    const unsubscribe = subscribeLive((e) => {
      if (e.type === "start") setStart(e.queue as Queue | null);
      else if (e.type === "reconnect") void reload();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [on]);

  const shown = selected?.kind === "lesson" && focus.slug === slug ? focus.focus : null;
  const queued = on ? start : null;
  const value = React.useMemo(() => ({ focus: shown, start: queued }), [shown, queued]);
  return <LessonContext.Provider value={value}>{children}</LessonContext.Provider>;
}

export const useLesson = () => React.useContext(LessonContext);
