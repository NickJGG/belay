"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeLive } from "./event-hub";

/**
 * Re-renders the current route when a session's data changes or a bridge comes, goes or changes state.
 * Bridge events and other files (chat, mocks) are for the session page, so they're ignored here.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeLive((e) => {
      if (e.type !== "sessions" && e.type !== "live" && e.type !== "reconnect") return;
      clearTimeout(timer);
      // Claude often writes several files in a row; one refresh covers the burst.
      timer = setTimeout(() => router.refresh(), 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [router]);

  return null;
}
