/** Belay projects, as belay's store loads them, with their icons. */
import { existsSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { Ctx } from "../../../src/ops.ts";
import { COLOR_RE } from "../../../src/store.ts";

export type Project = {
  key: string;
  name: string;
  status: string;
  focus: boolean;
  group?: string;
  /** Absolute path to the project's icon file, when it has one. */
  icon?: string;
  /** belay's `color:`, when it's a valid hex colour. */
  color?: string;
};

/** Where a repo's own favicon usually lives, in the order they're tried. */
const ICON_CANDIDATES = [
  "src/app/icon.svg",
  "app/icon.svg",
  "public/favicon.svg",
  "public/icon.svg",
  "favicon.ico",
  "public/favicon.ico",
  "icon.png",
];

export const ICON_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** belay's `icon:` (absolute, or relative to the first path), else the first favicon found in the repo. */
export function resolveIcon(field: string | undefined, root: string | undefined): string | undefined {
  const usable = (f: string) => extname(f).toLowerCase() in ICON_TYPES && existsSync(f);
  if (field) {
    if (isAbsolute(field)) return usable(field) ? field : undefined;
    return root && usable(resolve(root, field)) ? resolve(root, field) : undefined;
  }
  if (!root) return undefined;
  return ICON_CANDIDATES.map((c) => join(root, c)).find(usable);
}

/** Projects in `belay project list` order: focused first, then ungrouped before groups, then the manual order. */
export function projectsOf(ctx: Pick<Ctx, "projects">): Project[] {
  const projects = ctx.projects.map((p) => ({
    key: p.key,
    name: p.name,
    status: p.status,
    focus: p.focus,
    group: p.group,
    icon: resolveIcon(p.icon, p.paths[0]),
    color: p.color && COLOR_RE.test(p.color) ? p.color : undefined,
  }));
  // ctx.projects is already in order.yaml order, and the sort is stable.
  return projects.sort((a, b) => Number(b.focus) - Number(a.focus) || (a.group ?? "").localeCompare(b.group ?? ""));
}
