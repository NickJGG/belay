"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LiveProvider, useLive } from "@/components/live/live-provider";
import { LiveRefresh } from "@/components/live/live-refresh";
import { Drawer } from "@/components/session/drawer";
import { TurnDot } from "@/components/turn-dot";
import { Popover } from "@/components/ui/popover";
import type { DrawerSeed, LiveItem } from "@/lib/data";
import { clientKind } from "@/lib/extensions.client";
import type { Composer } from "@/lib/session-kind";
import { clampDrawer, COLLAPSED_DEFAULTS, pageKind, parseCollapsed, SIDEBAR_KEY, type Collapsed } from "@/lib/shell";
import { cn } from "@/lib/utils";
import type { ExtensionId } from "../../../../src/extension-ids.ts";
import { AmbientGlow } from "./ambient-glow";
import tabStyles from "./live-tabs.module.css";
import { LiveTabs, TabMark, tabHover, tabTitle } from "./live-tabs";
import { PaletteProvider } from "./palette";
import { Rail } from "./rail";
import { SlotProvider, useSlot } from "./shell-slot";
import { SiteNav } from "./site-nav";
import styles from "./shell.module.css";

/**
 * Every page's chrome: the ambient glow, the sidebar (pinned open or collapsed to its rail, or a Workspace's own pane; the phone's dock), the live Tabs over the page, and the Drawer
 * docked beside it while a Tab is live, and the command palette. Re-renders the page on session and Live changes.
 * `active` is the active extensions, whose session kinds draw into it.
 */
export function AppShell({
  live,
  seeds,
  active,
  children,
}: {
  live: LiveItem[];
  seeds: Record<string, DrawerSeed>;
  active: ExtensionId[];
  children: React.ReactNode;
}) {
  return (
    <LiveProvider live={live} seeds={seeds} active={active}>
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
  const { selected, kinds, active } = useLive();
  const kind = pageKind(pathname, active);
  const [collapsed, setCollapsed] = useCollapsed();
  const toggle = () => setCollapsed({ ...collapsed, [kind]: !collapsed[kind] });
  const { pane } = useSlot();

  return (
    <div className={cn(styles.shell, kind === "workspace" && styles.workspace, selected && styles.hasStrip)}>
      <AmbientGlow />
      <LiveRefresh />
      {kinds.map((k) => (k.Frame ? <k.Frame key={k.id} /> : null))}
      <SiteNav />
      {pane ?? <Rail open={!collapsed[kind]} onToggle={toggle} />}
      <div className={styles.col}>
        <LiveTabs />
        <main className={styles.main} data-kind={kind}>
          {children}
          {kinds.map((k) => (k.Main ? <k.Main key={k.id} /> : null))}
        </main>
      </div>
      <ShellDrawer />
      <Strip />
    </div>
  );
}

function ShellDrawer() {
  const { selected, kinds, chat, turn, usage, link, send, focusTerminal, drawer, setDrawer, sheet, setSheet } = useLive();
  if (!selected) return null;
  const kind = clientKind(selected);
  const drawerWith = (composer: Composer | null) => (
    <Drawer
      key={selected.slug}
      slug={selected.slug}
      md={kind.markdown?.(selected)}
      kind={kind}
      kinds={kinds}
      chat={chat}
      liveTurn={turn}
      usage={usage}
      link={link}
      send={send}
      open={drawer.open}
      onOpen={(open) => setDrawer({ open })}
      width={drawer.width}
      onWidth={(w) => setDrawer({ width: clampDrawer(w) })}
      composer={composer}
      onFocusTerminal={selected.wt ? focusTerminal : undefined}
      sheet={sheet}
      onSheet={setSheet}
    />
  );
  return kind.Composer ? <kind.Composer>{drawerWith}</kind.Composer> : drawerWith(null);
}

/** The narrow layout's bar for the selected Tab, above the dock: tap it for the Drawer, or switch Tabs. */
function Strip() {
  const { live, selected, select, setSheet, fresh } = useLive();
  const [switching, setSwitching] = React.useState(false);
  if (!selected) return null;
  return (
    <div className={styles.strip} data-session-strip>
      <button type="button" className={styles.stripMain} onClick={() => setSheet(true)} aria-label="Open the conversation" title={tabHover(selected)}>
        <TurnDot working={selected.working} />
        <TabMark s={selected} />
        <span className={tabStyles.title}>{tabTitle(selected)}</span>
      </button>
      {live.length > 1 ? (
        <Popover
          open={switching}
          onClose={() => setSwitching(false)}
          label="Live"
          trigger={
            <button type="button" className={styles.switchChip} aria-expanded={switching} onClick={() => setSwitching((s) => !s)}>
              {live.length} live ▾
              {live.some((s) => s.slug !== selected.slug && fresh.has(s.slug)) ? <span className={styles.chipDot} aria-label="New" /> : null}
            </button>
          }
        >
          <ul className={styles.switchList}>
            {live.map((s) => (
              <li key={s.slug}>
                <Link
                  href={s.href}
                  className={cn(styles.switchRow, s.slug === selected.slug && styles.switchOn)}
                  title={tabHover(s)}
                  onClick={() => {
                    select(s.slug);
                    setSwitching(false);
                  }}
                >
                  <TurnDot working={s.working} />
                  <TabMark s={s} />
                  <span className={tabStyles.title}>{tabTitle(s)}</span>
                  {fresh.has(s.slug) ? <span className={tabStyles.new}>New</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}
