import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { launchSpec, runLauncher, type LaunchContext, type LaunchSpec } from '../src/launch.ts';

let data: string;

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), 'belay-launch-'));
});

afterEach(() => rmSync(data, { recursive: true, force: true }));

const ctx = (over: Partial<LaunchContext> = {}): LaunchContext => ({
  env: { PATH: 'p' },
  home: resolve('/home/me'),
  cwd: resolve('/work'),
  data,
  platform: 'win32',
  ...over,
});

const CHANNEL_ARGS = [
  '--disallowedTools',
  'PowerShell,ScheduleWakeup,ListAgents,ReportFindings,Artifact,ArtifactComments,ArtifactData,mcp__claude_ai_Claude_Docs',
  '--dangerously-load-development-channels',
  'plugin:belay@belay',
];

test('claude runs in the cwd with the channel, the user args after it, and BELAY_CHANNEL set', () => {
  const spec = launchSpec('claude', ['--resume', 'x'], ctx());
  assert.equal(spec.cwd, resolve('/work'));
  assert.deepEqual(spec.args, [...CHANNEL_ARGS, '--resume', 'x']);
  assert.deepEqual(spec.env, { PATH: 'p', BELAY_CHANNEL: '1' });
  assert.equal(spec.marker, join(data, '.run', 'restart'));
  assert.equal(spec.acceptDialog, true);
});

test('learn runs in HANDHOLD_ROOT, else ~/Learning', () => {
  assert.equal(launchSpec('learn', [], ctx()).cwd, join(resolve('/home/me'), 'Learning'));
  assert.equal(launchSpec('learn', [], ctx({ env: { HANDHOLD_ROOT: 'D:/courses' } })).cwd, 'D:/courses');
});

test('the dialog helper is skipped under mintty and off Windows', () => {
  assert.equal(launchSpec('claude', [], ctx({ env: { TERM_PROGRAM: 'mintty' } })).acceptDialog, false);
  assert.equal(launchSpec('claude', [], ctx({ platform: 'linux' })).acceptDialog, false);
});

/** Fake deps: each claude run pops the next exit code and, when `restarts` says so, leaves the marker. */
function fake(spec: LaunchSpec, codes: number[], restarts: boolean[]) {
  const calls: string[][] = [];
  const events: string[] = [];
  return {
    calls,
    events,
    deps: {
      async claude(args: string[]) {
        calls.push(args);
        events.push('claude');
        if (restarts[calls.length - 1]) {
          mkdirSync(join(data, '.run'), { recursive: true });
          writeFileSync(spec.marker, '');
        }
        return codes[calls.length - 1];
      },
      acceptDialog() {
        events.push('dialog');
      },
      clearScreen() {
        events.push('clear');
      },
    },
  };
}

test('no restart marker: one run, exiting with its code, after clearing a stale marker', async () => {
  const spec = launchSpec('claude', ['hi'], ctx());
  mkdirSync(join(data, '.run'));
  writeFileSync(spec.marker, '');
  const f = fake(spec, [3], [false]);
  assert.equal(await runLauncher(spec, f.deps), 3);
  assert.deepEqual(f.calls, [[...CHANNEL_ARGS, 'hi']]);
  assert.deepEqual(f.events, ['dialog', 'claude']);
});

test('a restart marker relaunches without the user args, clearing the screen and the marker', async () => {
  const spec = launchSpec('learn', ['/learn', 'x'], ctx({ env: { TERM_PROGRAM: 'mintty' } }));
  const f = fake(spec, [0, 0, 7], [true, true, false]);
  assert.equal(await runLauncher(spec, f.deps), 7);
  assert.deepEqual(f.calls, [[...CHANNEL_ARGS, '/learn', 'x'], CHANNEL_ARGS, CHANNEL_ARGS]);
  assert.deepEqual(f.events, ['claude', 'clear', 'claude', 'clear', 'claude']);
  assert.equal(existsSync(spec.marker), false);
});
