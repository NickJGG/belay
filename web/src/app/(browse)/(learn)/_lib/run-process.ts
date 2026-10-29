import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runCommand, type RunEvent } from "./run.ts";

/*
 * A run of one work/ file as a local process: cwd is the file's folder, stdin its `.in` sidecar
 * (closed when there is none), no timeout. Output past `cap` bytes kills it.
 */

export const OUTPUT_CAP = 1_000_000;

// One run per file: starting another stops the previous.
const running = new Map<string, () => void>();

function killTree(pid: number) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
}

/**
 * Runs `abs`, reporting output and then exactly one exit event. Returns a stop function that
 * kills the process tree. Null when the file doesn't run.
 */
export function startRun(abs: string, onEvent: (e: RunEvent) => void, cap = OUTPUT_CAP): (() => void) | null {
  const command = runCommand(abs.replace(/\\/g, "/"));
  if (!command) return null;
  running.get(abs)?.();

  const started = Date.now();
  const input = `${abs}.in`;
  const stdin = fs.existsSync(input) && fs.statSync(input).isFile() ? fs.readFileSync(input) : null;
  // The server's own NODE_OPTIONS (Next's) aren't the learner's.
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: "utf-8" };
  delete env.NODE_OPTIONS;

  const child = spawn(command.cmd === "node" ? process.execPath : "python", command.args, {
    cwd: path.dirname(abs),
    env,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });

  let bytes = 0;
  let capped = false;
  let stopped = false;
  let done = false;
  const stop = () => {
    if (done || child.pid === undefined) return;
    stopped = true;
    killTree(child.pid);
  };
  const finish = (exit: number | null) => {
    if (done) return;
    done = true;
    if (running.get(abs) === stop) running.delete(abs);
    onEvent({ exit, ms: Date.now() - started, ...(capped && { capped }), ...(stopped && !capped && { stopped }) });
  };

  const pipe = (s: "out" | "err") => (t: string) => {
    if (capped) return;
    bytes += Buffer.byteLength(t);
    if (bytes > cap) {
      capped = true;
      stop();
      return;
    }
    onEvent({ s, t });
  };
  child.stdout.setEncoding("utf8").on("data", pipe("out"));
  child.stderr.setEncoding("utf8").on("data", pipe("err"));
  // A program that exits without reading its input closes the pipe early.
  child.stdin.on("error", () => {});
  child.stdin.end(stdin ?? undefined);

  child.on("error", (err) => {
    onEvent({ s: "err", t: `${err.message}\n` });
    finish(null);
  });
  child.on("close", (code) => finish(code));

  running.set(abs, stop);
  return stop;
}
