import type { PureKind } from "../../../../lib/session-kind.ts";
import type { ShellRules } from "../../../../lib/slots.ts";

/** The pseudo-project for grills nothing files. */
export const UNFILED = "unfiled";

const session: PureKind = {
  tools: { show: "Point the page at a question." },
  reattach: (slug) => `Not attached: run \`/grill resume ${slug}\` in the terminal`,
};

/** The grill a `/s/<slug>` page shows, else null. */
export function sessionSlug(pathname: string): string | null {
  const m = /^\/s\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Grills are Workspaces, each its own Tab. */
const shell: ShellRules = {
  workspace: (p) => !!sessionSlug(p),
  tab: sessionSlug,
  missing: (p) => {
    const grill = sessionSlug(p);
    return grill ? { what: `No grill ${grill}.`, back: { href: "/", label: "Back home" } } : null;
  },
  sections: [{ label: "Grills", suffix: "/grills" }],
  pseudo: { key: UNFILED, name: "Unfiled" },
};

export const manifest = { id: "grill", noun: "grills", session, shell } as const;
