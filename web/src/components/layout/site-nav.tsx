"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, House, LibraryBig, PanelLeftClose, Search, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { UNFILED } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { Mark, Wordmark } from "./logo";
import { openPalette } from "./palette";
import { useSlot, type Slot } from "./shell-slot";
import styles from "./site-nav.module.css";

export type NavItem = { href: string; label: string; icon: LucideIcon; on: (pathname: string) => boolean };

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House, on: (p) => p === "/" },
  // A grill lives in its project, so Projects is lit on one.
  { href: "/p", label: "Projects", icon: FolderOpen, on: (p) => under("/p")(p) || p.startsWith("/s/") },
  { href: "/courses", label: "Courses", icon: LibraryBig, on: under("/courses") },
];

/** A project's sections (grill Q19), nested under Projects while it's open. Unfiled has only Grills. */
export const PROJECT_SECTIONS = [
  { label: "Issues", suffix: "" },
  { label: "Grills", suffix: "/grills" },
  { label: "Activity", suffix: "/activity" },
  { label: "Logs", suffix: "/logs" },
];

export const sectionsOf = (key: string) => (key === UNFILED ? PROJECT_SECTIONS.filter((s) => s.label === "Grills") : PROJECT_SECTIONS);

/**
 * Topo's labelled site nav: a sticky sidebar from 768px, the bottom dock below it. The open project's sections
 * nest under Projects, and the open grill under its section. `collapsed` hides the sidebar for the rail.
 */
export function SiteNav({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: () => void }) {
  const pathname = usePathname() ?? "/";
  const slot = useSlot();
  return (
    <>
      <nav className={cn(styles.nav, collapsed && styles.collapsed)} aria-label="Primary">
        <Link href="/" className={styles.brand} aria-label="Belay home">
          <Wordmark className={styles.wordmark} />
        </Link>
        {NAV.map((item) => {
          const Icon = item.icon;
          const on = item.on(pathname);
          const sections = item.href === "/p" && slot.project;
          return (
            <React.Fragment key={item.href}>
              <Link
                href={item.href}
                className={cn(styles.item, on && styles.itemActive, sections && styles.itemParent)}
                aria-current={on && !sections ? "page" : undefined}
              >
                <Icon size={18} aria-hidden />
                <span>{item.label}</span>
              </Link>
              {sections ? <ProjectSections slot={slot} pathname={pathname} /> : null}
            </React.Fragment>
          );
        })}
        <button type="button" className={styles.item} onClick={openPalette}>
          <Search size={18} aria-hidden />
          <span>Search</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>
        <span className={styles.spacer} />
        <div className={styles.foot}>
          <ThemeToggle />
          <Button variant="ghost" size="icon-sm" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose size={16} aria-hidden />
          </Button>
        </div>
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

function ProjectSections({ slot, pathname }: { slot: Slot; pathname: string }) {
  const { project, section, detail, nav } = slot;
  if (!project) return null;
  const base = `/p/${encodeURIComponent(project.key)}`;
  return (
    <div className={styles.course}>
      <span className={styles.subHead}>{project.name}</span>
      <ul className={styles.sub} aria-label="Project sections">
        {sectionsOf(project.key).map((s) => {
          const href = base + s.suffix;
          const on = section ? section === s.label : pathname === href;
          return (
            <li key={s.label}>
              <Link
                href={href}
                className={cn(styles.subItem, on && (detail ? styles.parentOn : styles.subOn))}
                aria-current={on && !detail ? "page" : undefined}
              >
                {s.label}
              </Link>
              {on && detail ? (
                <>
                  <Link href={detail.href} className={cn(styles.subItem, styles.subOn, styles.child)} aria-current="page" title={detail.label}>
                    {detail.label}
                  </Link>
                  {nav ? <div className={styles.detailNav}>{nav}</div> : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
