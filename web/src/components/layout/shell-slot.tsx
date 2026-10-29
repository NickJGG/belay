"use client";

import * as React from "react";
import type { ExtensionId } from "../../../../src/extension-ids.ts";

/** What the open page tells the shell: where it sits under Projects, and a Workspace's own sidebar. */
export type Slot = {
  /** The open project, whose sections a Reading page lists below the app nav. */
  project?: { key: string; name: string };
  /** The open place an extension owns (a course), whose sections a Reading page lists below the app nav. */
  owner?: { id: ExtensionId; key: string; title: string };
  /** The section the page belongs to, lit in the sidebar; a section page's own address otherwise decides. */
  section?: string;
  /** A Workspace's own sidebar, drawn in place of the rail (a grill's Outline). */
  pane?: React.ReactNode;
  /** The ambient glow's colour: the owning project's or course's; Dusk when unset. */
  glow?: string;
};

const SlotContext = React.createContext<{ slot: Slot; setSlot: (s: Slot | null) => void }>({ slot: {}, setSlot: () => {} });

export function SlotProvider({ children }: { children: React.ReactNode }) {
  const [slot, set] = React.useState<Slot>({});
  const setSlot = React.useCallback((s: Slot | null) => set(s ?? {}), []);
  return <SlotContext.Provider value={{ slot, setSlot }}>{children}</SlotContext.Provider>;
}

export const useSlot = () => React.useContext(SlotContext).slot;

/** Rendered by a page to fill the shell's slot while it's open. */
export function ShellSlot(props: Slot) {
  const { setSlot } = React.useContext(SlotContext);
  const { project, owner, section, pane, glow } = props;
  React.useEffect(() => {
    setSlot({ project, owner, section, pane, glow });
    return () => setSlot(null);
  }, [setSlot, project, owner, section, pane, glow]);
  return null;
}
