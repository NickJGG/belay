"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, CircleDot, Cog, Moon, PanelLeftClose, PanelLeftOpen, ScrollText, Search, Sun } from "lucide-react";
import { useLive } from "@/components/live/live-provider";
import { activeClientSlots } from "@/lib/extensions.client";
import { pageKind } from "@/lib/shell";
import type { Icon } from "@/lib/slots";
import { sidebarSections } from "@/lib/sidebar";
import { cn } from "@/lib/utils";
import { Mark } from "./logo";
import { openPalette } from "./palette";
import { useSlot } from "./shell-slot";
import { tip, useTip } from "./side-tip";
import { useNav, type NavItem } from "./site-nav";
import styles from "./rail.module.css";

const SECTION_ICONS: Record<string, Icon> = {
  Issues: CircleDot,
  Activity,
  Logs: ScrollText,
};

/** The sidebar sections' icons: the core's and the active extensions'. */
function useSectionIcons(): Record<string, Icon> {
  const { active } = useLive();
  return React.useMemo(() => Object.assign({}, SECTION_ICONS, ...activeClientSlots(active).map((s) => s.sectionIcons)), [active]);
}

/**
 * The sidebar (>=768px; the phone keeps the dock), collapsed to icons (each labelled by a tip) or pinned `open` with labels: the mark and the
 * app nav on top, then a Reading page's project or course sections, and Theme, Settings and Collapse/Expand at the foot:
 * one line of icons when open, a stack of rows when collapsed.
 */
export function Rail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/";
  const slot = useSlot();
  const { active } = useLive();
  const sections = sidebarSections({ kind: pageKind(pathname, active), project: slot.project, owner: slot.owner, section: slot.section }, pathname, active);
  const sectionLit = !!sections?.rows.some((r) => r.on);
  const icons = useSectionIcons();
  const navRow = (item: NavItem) => {
    const Icon = item.icon;
    const parent = !!item.parent?.(slot);
    return <RailRow key={item.href} href={item.href} icon={<Icon size={16} aria-hidden />} label={item.label} title={item.label} shut={!open} on={item.on(pathname) && !(parent && sectionLit)} />;
  };
  const [home, ...rest] = useNav();
  const [railRef, tipNode] = useTip<HTMLElement>();
  return (
    <div className={cn(styles.railWrap, open && styles.open)}>
      <nav ref={railRef} className={styles.rail} aria-label="Primary">
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
          shut={!open}
        />
        {rest.map(navRow)}
        {sections ? (
          <>
            <RailRule />
            <span className={styles.railHead} title={sections.head}>
              {sections.head}
            </span>
            {sections.rows.map((r) => {
              const Icon = icons[r.label];
              return <RailRow key={r.label} href={r.href} icon={Icon ? <Icon size={16} aria-hidden /> : null} label={r.label} title={r.label} shut={!open} on={r.on} />;
            })}
          </>
        ) : null}
        <RailFoot open={open} onToggle={onToggle} label="sidebar" />
      </nav>
      {tipNode}
    </div>
  );
}

/** Theme, Settings and Collapse/Expand `label` (the toggle's noun), for the sidebar and a grill's Outline alike. */
export function RailFoot({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  const pathname = usePathname();
  return (
    <div className={cn(styles.railFoot, open && styles.footLine)}>
      <ThemeRow shut={!open} />
      <RailRow href="/settings" icon={<Cog size={16} aria-hidden />} label="Settings" title="Settings" shut={!open} on={pathname === "/settings"} />
      {open ? (
        <RailRow onClick={onToggle} icon={<PanelLeftClose size={16} aria-hidden />} label={`Collapse ${label}`} title={`Collapse ${label}`} />
      ) : (
        <RailRow onClick={onToggle} icon={<PanelLeftOpen size={16} aria-hidden />} label={`Expand ${label}`} title={`Expand ${label}`} shut />
      )}
    </div>
  );
}

/** A rail row: a link (`#…` stays a plain anchor) or, without `href`, a button. `shut`: collapsed, so `title` becomes its tip and name. */
export function RailRow({
  href,
  onClick,
  icon,
  label,
  title,
  shut,
  on,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
  title?: string;
  shut?: boolean;
  on?: boolean;
}) {
  const className = cn(styles.railRow, on && styles.on);
  const named = title ? { ...tip(!shut, title), "aria-label": shut ? title : undefined } : {};
  const body = (
    <>
      <span className={styles.railKey}>{icon}</span>
      <span className={styles.railLabel}>{label}</span>
    </>
  );
  if (!href) {
    return (
      <button type="button" className={className} {...named} onClick={onClick}>
        {body}
      </button>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} {...named}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...named} aria-current={on ? "page" : undefined}>
      {body}
    </Link>
  );
}

export function RailRule() {
  return <span className={styles.railRule} />;
}

const noopSubscribe = () => () => {};

/** The resolved theme once mounted; undefined while the server render's markup hydrates. */
export function useMountedTheme() {
  const { resolvedTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return mounted ? resolvedTheme : undefined;
}

function ThemeRow({ shut }: { shut: boolean }) {
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
      shut={shut}
    />
  );
}
