"use client";

import * as React from "react";
import { GLOW_KEY, parseGlow } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { useSlot } from "./shell-slot";
import styles from "./ambient-glow.module.css";

const CHANGED = "belay:glow";

function subscribe(onChange: () => void) {
  addEventListener(CHANGED, onChange);
  addEventListener("storage", onChange);
  return () => {
    removeEventListener(CHANGED, onChange);
    removeEventListener("storage", onChange);
  };
}

function readGlow() {
  try {
    return parseGlow(localStorage.getItem(GLOW_KEY));
  } catch {
    return true;
  }
}

/** This browser's Glow preference, shared by the halo, Settings' Glow switch and the palette. Off until hydrated. */
export const useGlow = () => React.useSyncExternalStore(subscribe, readGlow, () => false);

export function setGlow(on: boolean) {
  try {
    localStorage.setItem(GLOW_KEY, JSON.stringify(on));
  } catch {}
  dispatchEvent(new Event(CHANGED));
}

type Layer = { color: string; n: number };

/**
 * The dark theme's ambient light: one wide blurred halo above the top edge, in the open page's owner's colour (Dusk
 * by default), drifting on a 40s cycle. A colour change adds a layer that fades in over the old ones, which fade out.
 */
export function AmbientGlow() {
  const on = useGlow();
  const color = useSlot().glow ?? "var(--brand)";
  const [layers, setLayers] = React.useState<Layer[]>([{ color, n: 0 }]);
  const top = layers[layers.length - 1];
  if (top.color !== color) setLayers([...layers.slice(-2), { color, n: top.n + 1 }]);

  if (!on) return null;
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.halo}>
        {layers.map((l) => (
          <div
            key={l.n}
            className={cn(styles.layer, l !== top && styles.gone)}
            style={{ "--c": l.color } as React.CSSProperties}
            onTransitionEnd={() => l !== top && setLayers((ls) => ls.filter((x) => x !== l))}
          />
        ))}
      </div>
    </div>
  );
}
