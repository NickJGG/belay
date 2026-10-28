"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, House, LibraryBig, Search, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import { Mark } from "./logo";
import { openPalette } from "./palette";
import styles from "./site-nav.module.css";

export type NavItem = { href: string; label: string; icon: LucideIcon; on: (pathname: string) => boolean };

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

/** The app nav, Home first; Search follows Home in the sidebar and the dock alike. */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House, on: (p) => p === "/" },
  { href: "/p", label: "Projects", icon: FolderOpen, on: under("/p") },
  { href: "/learn", label: "Learn", icon: LibraryBig, on: under("/learn") },
];

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
  const [home, ...rest] = NAV;
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
