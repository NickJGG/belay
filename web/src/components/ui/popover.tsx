"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import styles from "./popover.module.css";

/**
 * A panel anchored under `trigger` while `open`; a bottom sheet under 768px.
 * Escape or a click outside calls `onClose`. Opening focuses the first element matching `focus`.
 */
export function Popover({
  open,
  onClose,
  trigger,
  label,
  focus = "button, a[href]",
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  label: string;
  focus?: string;
  children: React.ReactNode;
}) {
  const anchor = React.useRef<HTMLSpanElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [at, setAt] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // Portalled to body: a backdrop-filter ancestor (the sticky toolbar) would trap position: fixed.
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setAt({ top: r.bottom + 8, left: r.left });
    };
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
  }, [open, onClose]);

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
              className={styles.panel}
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
