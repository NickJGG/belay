"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity,
  Blend,
  BookOpen,
  CircleDot,
  FileCode,
  Layers,
  LayoutDashboard,
  ListChecks,
  MapIcon,
  MessagesSquare,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Sun,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { pageKind } from "@/lib/shell";
import { sidebarSections } from "@/lib/sidebar";
import { cn } from "@/lib/utils";
import { setGlow, useGlow } from "./ambient-glow";
import { Mark } from "./logo";
import { openPalette } from "./palette";
import { useSlot } from "./shell-slot";
import { NAV } from "./site-nav";
import styles from "./rail.module.css";

const SECTION_ICONS: Record<string, LucideIcon> = {
  Issues: CircleDot,
  Grills: MessagesSquare,
  Activity,
  Logs: ScrollText,
  Overview: LayoutDashboard,
  Syllabus: ListChecks,
  Map: MapIcon,
  Lessons: BookOpen,
  Notes: NotebookPen,
  Misconceptions: TriangleAlert,
  Cards: Layers,
  Work: FileCode,
};

/**
 * The sidebar (>=768px; the phone keeps the dock), collapsed to icons or pinned `open` with labels: the mark and the
 * app nav on top, then a Reading page's project or course sections, and Theme, Glow and Collapse/Expand at the foot:
 * one line of icons when open, a stack of rows when collapsed.
 */
export function Rail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/";
  const slot = useSlot();
  const sections = sidebarSections({ kind: pageKind(pathname), project: slot.project, course: slot.course, section: slot.section }, pathname);
  const sectionLit = !!sections?.rows.some((r) => r.on);
  const navRow = (item: (typeof NAV)[number]) => {
    const Icon = item.icon;
    const parent = item.href === "/p" ? !!slot.project : item.href === "/courses" && !!slot.course;
    return <RailRow key={item.href} href={item.href} icon={<Icon size={16} aria-hidden />} label={item.label} title={item.label} on={item.on(pathname) && !(parent && sectionLit)} />;
  };
  const [home, ...rest] = NAV;
  return (
    <div className={cn(styles.railWrap, open && styles.open)}>
      <nav className={styles.rail} aria-label="Primary">
        <Link href="/" className={cn(styles.railRow, styles.railLogo)} aria-label="Belay home">
          <span className={styles.railKey}>
            <Mark className={styles.railMark} />
          </span>
          <span className={styles.railLabel}>belay</span>
        </Link>
        {navRow(home)}
        <RailRow
          onClick={openPalette}
          icon={<Search size={16} aria-hidden />}
          label={
            <>
              Search <kbd>Ctrl K</kbd>
            </>
          }
          title="Search (Ctrl K)"
        />
        {rest.map(navRow)}
        {sections ? (
          <>
            <RailRule />
            <span className={styles.railHead} title={sections.head}>
              {sections.head}
            </span>
            {sections.rows.map((r) => {
              const Icon = SECTION_ICONS[r.label];
              return <RailRow key={r.label} href={r.href} icon={Icon ? <Icon size={16} aria-hidden /> : null} label={r.label} title={r.label} on={r.on} />;
            })}
          </>
        ) : null}
        <RailFoot open={open} onToggle={onToggle} label="sidebar" />
      </nav>
    </div>
  );
}

/** Theme, Glow and Collapse/Expand `label` (the toggle's noun), for the sidebar and a grill's Outline alike. */
export function RailFoot({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <div className={cn(styles.railFoot, open && styles.footLine)}>
      <ThemeRow />
      <GlowRow />
      {open ? (
        <RailRow onClick={onToggle} icon={<PanelLeftClose size={16} aria-hidden />} label={`Collapse ${label}`} title={`Collapse ${label}`} />
      ) : (
        <RailRow onClick={onToggle} icon={<PanelLeftOpen size={16} aria-hidden />} label={`Expand ${label}`} title={`Expand ${label}`} />
      )}
    </div>
  );
}

/** A rail row: a link (`#…` stays a plain anchor) or, without `href`, a button. */
export function RailRow({
  href,
  onClick,
  icon,
  label,
  title,
  on,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
  title?: string;
  on?: boolean;
}) {
  const className = cn(styles.railRow, on && styles.on);
  const body = (
    <>
      <span className={styles.railKey}>{icon}</span>
      <span className={styles.railLabel}>{label}</span>
    </>
  );
  if (!href) {
    return (
      <button type="button" className={className} title={title} onClick={onClick}>
        {body}
      </button>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} title={title}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className} title={title} aria-current={on ? "page" : undefined}>
      {body}
    </Link>
  );
}

export function RailRule() {
  return <span className={styles.railRule} />;
}

const noopSubscribe = () => () => {};

/** The resolved theme once mounted; undefined while the server render's markup hydrates. */
function useMountedTheme() {
  const { resolvedTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return mounted ? resolvedTheme : undefined;
}

function ThemeRow() {
  const { setTheme } = useTheme();
  const resolvedTheme = useMountedTheme();
  const ready = resolvedTheme !== undefined;
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <RailRow
      onClick={() => ready && setTheme(next)}
      icon={ready ? next === "light" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden /> : null}
      label="Theme"
      title={ready ? `Switch to ${next} theme` : "Toggle theme"}
    />
  );
}

/** Dark theme only: the glow never shows in light. */
function GlowRow() {
  const glow = useGlow();
  if (useMountedTheme() !== "dark") return null;
  const title = glow ? "Turn off background glow" : "Turn on background glow";
  return <RailRow onClick={() => setGlow(!glow)} icon={<Blend size={16} aria-hidden />} label="Glow" title={title} />;
}
