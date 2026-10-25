"use client";

import * as React from "react";

/** What the open page tells the shell: where it sits under Projects, and a Workspace's own rows. */
export type Slot = {
  /** The open project, nested under Projects with its sections. */
  project?: { key: string; name: string };
  /** The project section the page belongs to, lit in the sidebar; a section page's own address otherwise decides. */
  section?: string;
  /** The open detail page (a grill, an issue, a log entry), nested under its section. */
  detail?: { label: string; href: string };
  /** Rows for the collapsed rail, between the app nav and its foot (a grill's questions). */
  rail?: React.ReactNode;
  /** Rows nested under the detail in the expanded sidebar. */
  nav?: React.ReactNode;
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
  const { project, section, detail, rail, nav } = props;
  React.useEffect(() => {
    setSlot({ project, section, detail, rail, nav });
    return () => setSlot(null);
  }, [setSlot, project, section, detail, rail, nav]);
  return null;
}
