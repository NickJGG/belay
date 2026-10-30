/** Settings' view of each Extension card, its install job and the Glow row, kept pure for `node --test`. */
import type { ExtensionId, ExtensionInfo } from "../../../src/extension-ids.ts";
import type { Step } from "../../../src/install.ts";

/**
 * What the server knows of a bundled extension: its `belay.json` card facts, whether it's Installed, its setting, and
 * its sessions with a bridge attached.
 */
export type ExtensionState = Pick<ExtensionInfo, "id" | "name" | "summary" | "mark"> & {
  installed: boolean;
  on: boolean;
  attached: string[];
};

export type JobAction = "install" | "uninstall";

/**
 * The site's install or uninstall, one at a time. `restarting`: `belay serve` is rebuilding the site and this server
 * is about to exit; `boot` names it, so the page knows when a new one answers.
 */
export type ExtensionJob = { id: ExtensionId; action: JobAction; boot: string } & (
  | { state: "running"; step: Step; n: number; of: number }
  | { state: "done"; restarting: boolean }
  | { state: "failed"; error: string }
);

/**
 * A card. An uninstalled one only offers Install. An installed one's Off is locked while it's on and one of its
 * sessions is attached, as the CLI refuses `off` then, and its Uninstall is refused while any is; `inUse` names them,
 * and `then` ends that line.
 */
export function extensionCard(s: ExtensionState): {
  installed: boolean;
  locked: boolean;
  canUninstall: boolean;
  inUse: string[];
  then: string;
} {
  const inUse = s.installed ? s.attached : [];
  return {
    installed: s.installed,
    locked: s.installed && s.on && inUse.length > 0,
    canUninstall: s.installed && !inUse.length,
    inUse,
    then: s.on ? "Switch it off or uninstall it once that detaches." : "Uninstall it once that detaches.",
  };
}

const VERB: Record<JobAction, [string, string, string]> = {
  install: ["Installing", "Installed", "install"],
  uninstall: ["Uninstalling", "Uninstalled", "uninstall"],
};

/** The job's line on its card, e.g. "Installing: dependencies (1 of 4)…". */
export function jobLine(job: ExtensionJob): string {
  const [ing, ed, verb] = VERB[job.action];
  switch (job.state) {
    case "running":
      return `${ing}: ${job.step} (${job.n} of ${job.of})…`;
    case "done":
      return job.restarting ? `${ed}. Belay is rebuilding; this page reloads when it's back.` : `${ed}. Reloading…`;
    case "failed":
      return `Couldn't ${verb}: ${job.error}`;
  }
}

/** Whether a new job may start: none is running, and the site isn't about to restart. */
export const jobIdle = (job: ExtensionJob | null | undefined): boolean =>
  !job || job.state === "failed" || (job.state === "done" && !job.restarting);

/** Glow only shows in the dark theme: in light its switch is greyed. Unmounted (`undefined`) counts as dark. */
export function glowRow(theme: string | undefined): { disabled: boolean; what: string } {
  return theme === "light" ? { disabled: true, what: "Dark theme only." } : { disabled: false, what: "A soft colour wash behind the page." };
}
