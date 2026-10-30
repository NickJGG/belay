import "server-only";
/**
 * Settings' Install and Uninstall: one job at a time, run in this server over the CLI's install ops. Under
 * `belay serve` (`BELAY_SERVE`), a finished job leaves the restart marker and exits this process, so `belay serve`
 * regenerates, rebuilds and starts the site again; `pnpm dev` regenerates by itself, so there the page just reloads.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataDir, serveRestartMarker } from "../../../src/config.ts";
import { REPO, type ExtensionId } from "../../../src/extension-ids.ts";
import { installExtension, realSteps, uninstallExtension } from "../../../src/install.ts";
import { jobIdle, type ExtensionJob, type JobAction } from "./settings";

// Kept on globalThis: Next may load this module more than once in one process.
const g = globalThis as typeof globalThis & { belayBoot?: string; belayJob?: ExtensionJob };

/** This server process, so a page can tell when a new one answers. */
export const BOOT = (g.belayBoot ??= `${process.pid}.${Date.now()}`);

export const currentJob = (): ExtensionJob | null => g.belayJob ?? null;

/** Starts `action` on `id` in the background; throws when another job is running. */
export function startJob(id: ExtensionId, action: JobAction): void {
  if (!jobIdle(g.belayJob)) throw new Error(`already ${g.belayJob!.action}ing ${g.belayJob!.id}`);
  const base = { id, action, boot: BOOT };
  g.belayJob = { ...base, state: "running", step: action === "install" ? "dependencies" : "record", n: 1, of: 4 };
  const data = dataDir();
  const o = { root: REPO, data, steps: realSteps, onStep: (step, n, of) => (g.belayJob = { ...base, state: "running", step, n, of }) } satisfies Parameters<typeof installExtension>[1];
  (action === "install" ? installExtension(id, o) : uninstallExtension(id, o)).then(
    () => {
      const restarting = !!process.env.BELAY_SERVE;
      g.belayJob = { ...base, state: "done", restarting };
      if (!restarting) return;
      const marker = serveRestartMarker(data);
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, "");
      // Long enough for the page's next poll to see "done" and show the rebuilding line.
      setTimeout(() => process.exit(0), 1500);
    },
    (e: Error) => (g.belayJob = { ...base, state: "failed", error: e.message }),
  );
}
