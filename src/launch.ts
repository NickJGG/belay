/**
 * `belay claude`: Claude Code with the Belay channel loaded. Extensions launch it too (`belay learn`). A lesson's
 * restart (bridge/kinds/learn.runtime.mts) leaves `<runDir>/restart` and ends claude, and the loop starts a fresh session.
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, runDir } from './config.ts';

const CHANNEL = 'plugin:belay@belay';
// Tools these sessions never use, kept out of every call's context. The flag is variadic, so the channel flag
// after it ends the list before a user's prompt can be read as a tool name.
// A bare `mcp__<server>` rule covers every tool on that server.
const UNUSED_TOOLS = [
  'PowerShell',
  'ScheduleWakeup',
  'ListAgents',
  'ReportFindings',
  'Artifact',
  'ArtifactComments',
  'ArtifactData',
  'mcp__claude_ai_Claude_Docs',
];
const CHANNEL_ARGS = ['--disallowedTools', UNUSED_TOOLS.join(','), '--dangerously-load-development-channels', CHANNEL];

export interface LaunchSpec {
  cwd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** The restart marker. */
  marker: string;
  /** Whether to start the helper that accepts the dev-channels dialog. */
  acceptDialog: boolean;
}

export interface LaunchContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  data: string;
  platform: NodeJS.Platform;
}

export function launchSpec(argv: string[], c: LaunchContext): LaunchSpec {
  return {
    cwd: c.cwd,
    args: [...CHANNEL_ARGS, ...argv],
    // BELAY_CHANNEL tells /grill and /learn the channel is loaded, so site messages can reach this session.
    env: { ...c.env, BELAY_CHANNEL: '1' },
    marker: join(runDir(c.data), 'restart'),
    // The helper reads the Windows console, which mintty doesn't have, so there you accept the dialog yourself.
    acceptDialog: c.platform === 'win32' && c.env.TERM_PROGRAM !== 'mintty',
  };
}

export interface LaunchDeps {
  /** Runs claude to its exit and resolves with its exit code. */
  claude(args: string[], spec: LaunchSpec): Promise<number>;
  /** Starts the dialog helper without waiting for it. */
  acceptDialog(spec: LaunchSpec): void;
  clearScreen(): void;
}

/** Resolves with claude's exit code once it exits without a restart marker. */
export async function runLauncher(spec: LaunchSpec, deps: LaunchDeps): Promise<number> {
  rmSync(spec.marker, { force: true });
  let args = spec.args;
  for (;;) {
    if (spec.acceptDialog) deps.acceptDialog(spec);
    const code = await deps.claude(args, spec);
    if (!existsSync(spec.marker)) return code;
    rmSync(spec.marker, { force: true });
    deps.clearScreen();
    // The fresh session takes no arguments: the queued start tells it what to run.
    args = CHANNEL_ARGS;
  }
}

/** The command, run in `cwd`: everything after it goes to claude untouched. Never rejects; a failure goes to stderr. */
export async function launchCommand(argv: string[], cwd = process.cwd()): Promise<void> {
  try {
    const spec = launchSpec(argv, { env: process.env, cwd, data: dataDir(), platform: process.platform });
    process.exitCode = await runLauncher(spec, realDeps);
  } catch (e) {
    console.error(`belay: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const HELPER =fileURLToPath(new URL('../scripts/accept-dev-channels.ps1', import.meta.url));

export const realDeps: LaunchDeps = {
  claude(args, spec) {
    return new Promise((resolve, reject) => {
      // Ctrl+C belongs to claude, which shares the console; the launcher waits for it to exit.
      const ignore = () => {};
      process.on('SIGINT', ignore);
      const child = spawn('claude', args, { cwd: spec.cwd, env: spec.env, stdio: 'inherit' });
      child.on('error', (e) => {
        process.off('SIGINT', ignore);
        reject(new Error(`can't start claude: ${e.message}`));
      });
      child.on('exit', (code) => {
        process.off('SIGINT', ignore);
        resolve(code ?? 1);
      });
    });
  },
  acceptDialog() {
    // Not `detached`: on Windows that gives the helper its own console, and it has to read claude's.
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER, CHANNEL], {
      stdio: 'ignore',
    });
    child.on('error', () => {});
    child.unref();
  },
  clearScreen() {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  },
};
