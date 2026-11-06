"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import styles from "./popover.module.css";

/**
 * A panel anchored under `trigger` while `open`; a bottom sheet under 768px.
 * Escape or a click outside calls `onClose`. Opening focuses the first element matching `focus`.
 * It flips above the trigger when there's no room below (a trigger in a bottom dock).
 */
export function Popover({
  open,
  onClose,
  trigger,
  label,
  focus = "button, a[href]",
  panelClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  label: string;
  focus?: string;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const anchor = React.useRef<HTMLSpanElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [at, setAt] = React.useState<{ top: number; left: number } | null>(null);

  const place = React.useCallback(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const h = panel.current?.offsetHeight ?? 0;
    const top = r.bottom + 8 + h > innerHeight && r.top - 8 - h >= 0 ? r.top - 8 - h : r.bottom + 8;
    setAt((a) => (a && a.top === top && a.left === r.left ? a : { top, left: r.left }));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    // Portalled to body: a backdrop-filter ancestor (the sticky toolbar) would trap position: fixed.
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      setAt(null);
    };
  }, [open, onClose, place]);

  // The first placement can't know the panel's height; re-place once it has rendered.
  React.useLayoutEffect(() => {
    if (at) place();
  }, [at, place]);

  React.useEffect(() => {
    if (at) panel.current?.querySelector<HTMLElement>(focus)?.focus();
  }, [at, focus]);

  return (
    <span ref={anchor} className={styles.anchor}>
      {trigger}
      {open && at
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={label}
              className={cn(styles.panel, panelClassName)}
              style={{ "--pop-top": `${at.top}px`, "--pop-left": `${at.left}px` } as React.CSSProperties}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
