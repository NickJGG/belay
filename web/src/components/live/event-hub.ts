"use client";

import type { HubEvent } from "@/lib/hub";

/*
 * The tab's one EventSource on /api/events, shared by every subscriber and closed when the
 * last one leaves. After a drop and reconnect, subscribers get `{type: "reconnect"}`: events
 * sent while disconnected were missed.
 */

export type LiveEvent = HubEvent | { type: "reconnect" };

type Listener = (event: LiveEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;

function emit(event: LiveEvent) {
  for (const l of listeners) l(event);
}

function open() {
  let dropped = false;
  source = new EventSource("/api/events");
  source.onmessage = (e) => {
    try {
      emit(JSON.parse(e.data) as LiveEvent);
    } catch {}
  };
  source.onerror = () => {
    dropped = true;
  };
  source.onopen = () => {
    if (dropped) emit({ type: "reconnect" });
    dropped = false;
  };
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  if (!source) open();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && source) {
      source.close();
      source = null;
    }
  };
}
