/** The site's `focus` message: raise and select the session's Windows Terminal tab (plugin/scripts). */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const SCRIPT = fileURLToPath(new URL("../scripts/focus-terminal-tab.ps1", import.meta.url));
const powershell = (args) => new Promise((resolve) => execFile("powershell.exe", args, { windowsHide: true, timeout: 10_000 }, (err, stdout) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout) })));
/**
 * Null once the tab is up, else why not (the script's own reason when it ran). The script finds the tab through
 * `claudePid`'s console, and falls back to the session title in the transcript (`id` in `dir`) when it can't.
 */
export async function focusTab(o) {
    if (!o.wt)
        return "not in Windows Terminal";
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-ClaudePid", String(o.claudePid)];
    if (o.id && o.dir)
        args.push("-Transcript", path.join(o.dir, `${o.id}.jsonl`));
    const { code, stdout } = await (o.run ?? powershell)(args);
    return code === 0 ? null : stdout.trim() || "couldn't focus the terminal tab";
}
