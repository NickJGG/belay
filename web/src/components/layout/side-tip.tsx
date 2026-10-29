"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import styles from "./side-tip.module.css";

/** Expanded, a row's label is the native title; collapsed, it's `data-tip`, which `useTip` shows at once. */
export const tip = (open: boolean, text: string) => (open ? { title: text } : { "data-tip": text });

/**
 * The hover label of the hovered or focused `[data-tip]` row, portalled past the pane's overflow: right of the pane,
 * or under a `data-tip-below` row. For a collapsed sidebar and a grill's Outline.
 */
export function useTip<T extends HTMLElement = HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [at, setAt] = React.useState<{ text: string; top: number; left: number; below: boolean } | null>(null);
  React.useEffect(() => {
    const pane = ref.current;
    if (!pane) return;
    const show = (e: Event) => {
      const row = (e.target as Element).closest<HTMLElement>("[data-tip]");
      if (!row || !pane.contains(row)) return setAt(null);
      const r = row.getBoundingClientRect();
      const below = row.dataset.tipBelow !== undefined;
      setAt(
        below
          ? { text: row.dataset.tip ?? "", top: r.bottom + 6, left: r.left + r.width / 2, below }
          : { text: row.dataset.tip ?? "", top: r.top + r.height / 2, left: pane.getBoundingClientRect().right + 8, below },
      );
    };
    const hide = () => setAt(null);
    pane.addEventListener("pointerover", show);
    pane.addEventListener("pointerleave", hide);
    pane.addEventListener("focusin", show);
    pane.addEventListener("focusout", hide);
    pane.addEventListener("click", hide);
    pane.addEventListener("scroll", hide, true);
    return () => {
      pane.removeEventListener("pointerover", show);
      pane.removeEventListener("pointerleave", hide);
      pane.removeEventListener("focusin", show);
      pane.removeEventListener("focusout", hide);
      pane.removeEventListener("click", hide);
      pane.removeEventListener("scroll", hide, true);
      setAt(null);
    };
  }, []);
  const node = at
    ? createPortal(
        <span role="tooltip" className={cn(styles.tip, at.below && styles.below)} style={{ top: at.top, left: at.left }}>
          {at.text}
        </span>,
        document.body,
      )
    : null;
  return [ref, node] as const;
}
