"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, PanelLeftOpen, Search, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Mark } from "./logo";
import { openSearch } from "./search";
import { useSlot } from "./shell-slot";
import { NAV } from "./site-nav";
import styles from "./rail.module.css";

/**
 * The collapsed sidebar (>=768px; the phone keeps the dock): the mark and the app nav pinned on top, the page's
 * own rows scrolling between, Theme and Expand at the foot.
 */
export function Rail({ onExpand }: { onExpand: () => void }) {
  const pathname = usePathname() ?? "/";
  const slot = useSlot();
  return (
    <div className={styles.railWrap}>
      <nav className={styles.rail} aria-label="Primary">
        <Link href="/" className={cn(styles.railRow, styles.railLogo)} aria-label="Belay home">
          <span className={styles.railKey}>
            <Mark className={styles.railMark} />
          </span>
          <span className={styles.railLabel}>belay</span>
        </Link>
        {NAV.map((item) => {
          const Icon = item.icon;
          return <RailRow key={item.href} href={item.href} icon={<Icon size={16} aria-hidden />} label={item.label} title={item.label} on={item.on(pathname)} />;
        })}
        <RailRow
          onClick={openSearch}
          icon={<Search size={16} aria-hidden />}
          label={
            <>
              Search <kbd>Ctrl K</kbd>
            </>
          }
          title="Search (Ctrl K)"
        />
        {slot.rail ? (
          <>
            <RailRule />
            <div className={styles.railScroll}>{slot.rail}</div>
          </>
        ) : null}
        <div className={styles.railFoot}>
          <ThemeRow />
          <RailRow onClick={onExpand} icon={<PanelLeftOpen size={16} aria-hidden />} label="Expand sidebar" title="Expand sidebar" />
        </div>
      </nav>
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
  pulse,
  keyClassName,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
  title?: string;
  on?: boolean;
  pulse?: boolean;
  keyClassName?: string;
}) {
  const className = cn(styles.railRow, on && styles.on, pulse && styles.pulse);
  const body = (
    <>
      <span className={cn(styles.railKey, keyClassName)}>{icon}</span>
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

function ThemeRow() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const ready = mounted && resolvedTheme !== undefined;
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
