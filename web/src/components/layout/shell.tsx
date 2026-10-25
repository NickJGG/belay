"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FocusHighlight } from "@/components/content/focus-highlight";
import { LiveProvider, useLive } from "@/components/live/live-provider";
import { FollowAlong } from "@/components/live/follow";
import { LiveRefresh } from "@/components/live/live-refresh";
import { Drawer } from "@/components/session/drawer";
import { TurnDot } from "@/components/turn-dot";
import { Popover } from "@/components/ui/popover";
import type { DrawerSeed, LiveItem } from "@/lib/data";
import { clampDrawer, COLLAPSED_DEFAULTS, pageKind, parseCollapsed, SIDEBAR_KEY, type Collapsed } from "@/lib/shell";
import { cn } from "@/lib/utils";
import tabStyles from "./live-tabs.module.css";
import { LiveTabs, tabTitle, turnState } from "./live-tabs";
import { PaletteProvider } from "./palette";
import { Rail } from "./rail";
import { SlotProvider } from "./shell-slot";
import { SiteNav } from "./site-nav";
import styles from "./shell.module.css";

/**
 * Every page's chrome: the sidebar (or its rail, or the phone's dock), the live Tabs over the page, and the Drawer
 * docked beside it while a Tab is live, and the command palette. Re-renders the page on session and Live changes.
 */
export function AppShell({ live, seeds, children }: { live: LiveItem[]; seeds: Record<string, DrawerSeed>; children: React.ReactNode }) {
  return (
    <LiveProvider live={live} seeds={seeds}>
      <SlotProvider>
        <PaletteProvider>
          <Frame>{children}</Frame>
        </PaletteProvider>
      </SlotProvider>
    </LiveProvider>
  );
}

function useCollapsed(): [Collapsed, (c: Collapsed) => void] {
  const [collapsed, setCollapsed] = React.useState<Collapsed>(COLLAPSED_DEFAULTS);
  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SIDEBAR_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
    setCollapsed(parseCollapsed(raw));
  }, []);
  const save = React.useCallback((c: Collapsed) => {
    setCollapsed(c);
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify(c));
    } catch {}
  }, []);
  return [collapsed, save];
}

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const kind = pageKind(pathname);
  const [collapsed, setCollapsed] = useCollapsed();
  const toggle = () => setCollapsed({ ...collapsed, [kind]: !collapsed[kind] });
  const { selected } = useLive();

  return (
    <div className={cn(styles.shell, kind === "workspace" && styles.workspace, selected && styles.hasStrip)}>
      <LiveRefresh />
      {/* Only course pages anchor claims: a grill keeps its view (`#q-3`) in the hash. */}
      {pathname.startsWith("/courses/") ? <FocusHighlight /> : null}
      <SiteNav collapsed={collapsed[kind]} onCollapse={toggle} />
      {collapsed[kind] ? <Rail onExpand={toggle} /> : null}
      <div className={styles.col}>
        <LiveTabs />
        <main className={styles.main} data-kind={kind}>
          {children}
          {selected?.kind === "lesson" ? <FollowAlong key={selected.slug} /> : null}
        </main>
      </div>
      <ShellDrawer />
      <Strip />
    </div>
  );
}

function ShellDrawer() {
  const { selected, chat, turn, usage, link, send, drawer, setDrawer, sheet, setSheet, comment, setComment } = useLive();
  if (!selected) return null;
  return (
    <Drawer
      key={selected.slug}
      slug={selected.slug}
      course={selected.course}
      title={
        <>
          {selected.kind} · <Link href={selected.href}>{tabTitle(selected)}</Link>
        </>
      }
      chat={chat}
      liveTurn={turn}
      usage={usage}
      link={link}
      send={send}
      open={drawer.open}
      onOpen={(open) => setDrawer({ open })}
      width={drawer.width}
      onWidth={(w) => setDrawer({ width: clampDrawer(w) })}
      comment={comment}
      onComment={setComment}
      sheet={sheet}
      onSheet={setSheet}
    />
  );
}

/** The narrow layout's bar for the selected Tab, above the dock: tap it for the Drawer, or switch Tabs. */
function Strip() {
  const { live, selected, select, setSheet } = useLive();
  const [switching, setSwitching] = React.useState(false);
  if (!selected) return null;
  return (
    <div className={styles.strip} data-session-strip>
      <button type="button" className={styles.stripMain} onClick={() => setSheet(true)} aria-label="Open the conversation">
        <TurnDot working={selected.working} />
        <span className={tabStyles.kind}>{selected.kind}</span>
        <span className={tabStyles.title}>{tabTitle(selected)}</span>
        <span className={tabStyles.state}>{turnState(selected)}</span>
      </button>
      {live.length > 1 ? (
        <Popover
          open={switching}
          onClose={() => setSwitching(false)}
          label="Live"
          trigger={
            <button type="button" className={styles.switchChip} aria-expanded={switching} onClick={() => setSwitching((s) => !s)}>
              {live.length} live ▾
            </button>
          }
        >
          <ul className={styles.switchList}>
            {live.map((s) => (
              <li key={s.slug}>
                <Link
                  href={s.href}
                  className={cn(styles.switchRow, s.slug === selected.slug && styles.switchOn)}
                  onClick={() => {
                    select(s.slug);
                    setSwitching(false);
                  }}
                >
                  <TurnDot working={s.working} />
                  <span className={tabStyles.kind}>{s.kind}</span>
                  <span className={tabStyles.title}>{tabTitle(s)}</span>
                  <span className={tabStyles.state}>{turnState(s)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}
