"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLive } from "@/components/live/live-provider";
import { TurnDot } from "@/components/turn-dot";
import type { LiveItem } from "@/lib/data";
import { clientKind } from "@/lib/extensions.client";
import { pageTab } from "@/lib/shell";
import { cn } from "@/lib/utils";
import styles from "./live-tabs.module.css";

/** Where a live session stands, for its Tab's hover title (the TurnDot shows it). */
export const turnState = (s: Pick<LiveItem, "working">) => (s.working ? "working" : "your turn");

/** A Tab's name, from its kind: a grill's slug, a lesson's topic. */
export const tabTitle = (s: LiveItem) => clientKind(s).title(s);

/** A Tab's hover title: its kind's place (project or course), topic and state. */
export const tabHover = (s: LiveItem) => `${clientKind(s).place(s)} · ${s.topic} · ${turnState(s)}`;

/** A Tab's marker, from its kind: a lesson's course book, a grill's project mark. */
export const TabMark = ({ s }: { s: LiveItem }) => clientKind(s).mark(s);

/** A Tab being dragged. Kept in a ref and drawn with inline transforms, so dragging doesn't re-render. */
type Drag = { slug: string; el: HTMLElement; x: number; moved: boolean; from: number; at: number; tabs: HTMLElement[]; mids: number[]; step: number };

/** How far a press must travel before it's a drag rather than a click. */
const SLOP = 5;

/**
 * One Tab per attached grill or lesson, above the page. The open page's Tab looks like the page's own; the selected one
 * elsewhere (what the Drawer shows) only keeps a faint underline. One not yet opened in this browser reads New.
 * Nothing while none is live.
 *
 * Drag a Tab along the row to reorder: it rides under the cursor and the others slide aside to open its gap.
 */
export function LiveTabs() {
  const { live, selected, select, move, fresh, active } = useLive();
  const here = pageTab(usePathname() ?? "/", live, active);
  const drag = React.useRef<Drag | null>(null);
  const dropped = React.useRef(false);
  if (!live.length) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    dropped.current = false;
    const el = (e.target as Element).closest<HTMLElement>("[data-tab]");
    if (!el || e.button !== 0 || e.pointerType === "touch") return;
    const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-tab]")];
    const from = tabs.indexOf(el);
    const mids = tabs.map((t) => {
      const r = t.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const step = el.getBoundingClientRect().width + (parseFloat(getComputedStyle(e.currentTarget).columnGap) || 0);
    drag.current = { slug: el.dataset.tab!, el, x: e.clientX, moved: false, from, at: from, tabs, mids, step };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < SLOP) return;
      d.moved = true;
      e.currentTarget.dataset.sorting = "";
      d.el.dataset.dragging = "";
    }
    d.at = d.mids.filter((m, i) => i !== d.from && m < e.clientX).length;
    d.el.style.transform = `translateX(${dx}px)`;
    d.tabs.forEach((t, i) => {
      if (i === d.from) return;
      const shift = i > d.from && i <= d.at ? -d.step : i < d.from && i >= d.at ? d.step : 0;
      t.style.transform = shift ? `translateX(${shift}px)` : "";
    });
  };

  const end = (nav: HTMLElement, drop: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    delete nav.dataset.sorting;
    delete d.el.dataset.dragging;
    for (const t of d.tabs) t.style.transform = "";
    if (!drop) return;
    dropped.current = true;
    if (d.at !== d.from) move(d.slug, d.at);
  };

  return (
    <nav
      className={styles.tabs}
      aria-label="Live"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e.currentTarget, true)}
      onPointerCancel={(e) => end(e.currentTarget, false)}
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        // The click that ends a drag mustn't open the Tab.
        if (!dropped.current) return;
        dropped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {live.map((s) => {
        const on = s.slug === here;
        const picked = !on && s.slug === selected?.slug;
        return (
          <Link
            key={s.slug}
            data-tab={s.slug}
            href={s.href}
            onClick={() => select(s.slug)}
            className={cn(styles.tab, on && styles.on, picked && styles.picked, fresh.has(s.slug) && styles.fresh)}
            aria-current={on ? "page" : picked ? "true" : undefined}
            title={tabHover(s)}
          >
            <TurnDot working={s.working} />
            <TabMark s={s} />
            <span className={styles.title}>{tabTitle(s)}</span>
            {fresh.has(s.slug) ? <span className={styles.new}>New</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
