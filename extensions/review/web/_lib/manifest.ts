import type { PureKind } from "../../../../web/src/lib/session-kind.ts";
import type { ShellRules } from "../../../../web/src/lib/slots.ts";

/** The pseudo-project for reviews of repos no project claims, shared with grill's. */
export const UNFILED = "unfiled";

const session: PureKind = {
  tools: {},
  reattach: (id) => `Not attached: run \`/review:review resume ${id}\` in the terminal`,
};

/** The review a `/r/<id>` page shows, else null. */
export function reviewId(pathname: string): string | null {
  const m = /^\/r\/([^/?#]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Reviews are Workspaces, each its own Tab while its session is attached. */
const shell: ShellRules = {
  workspace: (p) => !!reviewId(p),
  tab: reviewId,
  missing: (p) => {
    const id = reviewId(p);
    return id ? { what: `No review ${id}.`, back: { href: "/", label: "Back home" } } : null;
  },
  sections: [{ label: "Reviews", suffix: "/reviews" }],
  pseudo: { key: UNFILED, name: "Unfiled" },
};

export const manifest = { id: "review", noun: "reviews", session, shell } as const;
