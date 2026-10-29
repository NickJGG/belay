"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useTip } from "./side-tip";
import styles from "./side-pane.module.css";

/**
 * The left pane's container (>=768px; the phone keeps the dock), shared by the sidebar and a grill's Outline so they
 * read as one component: full height, `--side-w` open and `--rail-w` collapsed, with `foot` pinned to the bottom and
 * the collapsed rows' tips. `className` marks the state for the contents' own styles.
 */
export function SidePane({
  open,
  label,
  className,
  foot,
  children,
}: {
  open: boolean;
  label: string;
  className?: string;
  foot: React.ReactNode;
  children: React.ReactNode;
}) {
  const [ref, tipNode] = useTip<HTMLElement>();
  return (
    <aside ref={ref} className={cn(styles.pane, !open && styles.shut, className)} aria-label={label}>
      {children}
      {foot}
      {tipNode}
    </aside>
  );
}
