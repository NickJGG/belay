"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, House, Search } from "lucide-react";
import { useLive } from "@/components/live/live-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { activeClientSlots } from "@/lib/extensions.client";
import type { NavItem } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { Mark } from "./logo";
import { openPalette } from "./palette";
import styles from "./site-nav.module.css";

export type { NavItem };

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

const CORE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House, on: (p) => p === "/" },
  { href: "/p", label: "Projects", icon: FolderOpen, on: under("/p"), parent: (slot) => !!slot.project },
];

/** The app nav, Home first, then the active extensions' entries; Search follows Home in the sidebar and the dock alike. */
export function useNav(): NavItem[] {
  const { active } = useLive();
  return React.useMemo(() => [...CORE_NAV, ...activeClientSlots(active).flatMap((s) => s.nav ?? [])], [active]);
}

/** The phone's nav (below 768px, where the rail is hidden): the bottom dock, and the mark and Theme above the page. */
export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const item = (it: NavItem) => {
    const Icon = it.icon;
    const on = it.on(pathname);
    return (
      <Link key={it.href} href={it.href} className={cn(styles.item, on && styles.itemActive)} aria-current={on ? "page" : undefined}>
        <Icon size={18} aria-hidden />
        <span>{it.label}</span>
      </Link>
    );
  };
  const [home, ...rest] = useNav();
  return (
    <>
      <nav className={styles.nav} aria-label="Primary">
        {item(home)}
        <button type="button" className={styles.item} onClick={openPalette}>
          <Search size={18} aria-hidden />
          <span>Search</span>
        </button>
        {rest.map(item)}
      </nav>
      <div className={styles.phoneTop}>
        <Link href="/" aria-label="Belay home">
          <Mark className={styles.phoneMark} />
        </Link>
        <ThemeToggle />
      </div>
    </>
  );
}
