"use client";

import * as React from "react";

/** What the open page tells the shell: where it sits under Projects, and a Workspace's own sidebar. */
export type Slot = {
  /** The open project, whose sections a Reading page lists below the app nav. */
  project?: { key: string; name: string };
  /** The open course, whose sections a Reading page lists below the app nav. */
  course?: { slug: string; title: string };
  /** The project or course section the page belongs to, lit in the sidebar; a section page's own address otherwise decides. */
  section?: string;
  /** A Workspace's own sidebar, drawn in place of the rail (a grill's Outline). */
  pane?: React.ReactNode;
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
  const { project, course, section, pane } = props;
  React.useEffect(() => {
    setSlot({ project, course, section, pane });
    return () => setSlot(null);
  }, [setSlot, project, course, section, pane]);
  return null;
}
