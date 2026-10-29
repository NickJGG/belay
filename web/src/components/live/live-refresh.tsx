"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeLive } from "./event-hub";
import { useLive } from "./live-provider";

/**
 * Re-renders the current route when a session's data, belay's or its settings change, or a bridge comes, goes or changes
 * state, and on the events an active kind asks for (a course's files, but not work/, which is the Work tab editor's).
 * Bridge events and other files (chat, mocks) are for the session page, so they're ignored here.
 */
export function LiveRefresh() {
  const router = useRouter();
  const { kinds } = useLive();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeLive((e) => {
      const asked = kinds.some((k) => k.refresh?.(e));
      if (!asked && e.type !== "sessions" && e.type !== "live" && e.type !== "belay" && e.type !== "settings" && e.type !== "reconnect") return;
      clearTimeout(timer);
      // Claude often writes several files in a row; one refresh covers the burst.
      timer = setTimeout(() => router.refresh(), 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [router, kinds]);

  return null;
}
