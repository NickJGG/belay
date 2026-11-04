import "server-only";
import { spawn } from "node:child_process";

/** An argv as one line to paste into a shell; only arguments that need it are quoted. */
export const commandLine = (argv: string[]): string => argv.map((a) => (/^[\w./:@=-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)).join(" ");

/**
 * Opens a Windows Terminal tab in `dir` running `argv`. Elsewhere, or when no terminal starts, hands back `command`
 * (by default `argv` as one line) for the user to run themselves.
 */
export async function openTerminal(dir: string, argv: string[], command = commandLine(argv)): Promise<{ started: true } | { command: string }> {
  if (process.platform !== "win32") return { command };
  const started = await new Promise<boolean>((resolve) => {
    // Its arguments are an argv, so nothing is parsed by a shell.
    const child = spawn("wt.exe", ["-d", dir, ...argv], { detached: true, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
  return started ? { started } : { command };
}
