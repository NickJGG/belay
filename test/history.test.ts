import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { duration, encodeCwd, parseTranscript, recentSessions } from '../src/history.ts';
import type { Project } from '../src/store.ts';

const jsonl = (...entries: object[]) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

const transcript = (cwd: string, title: string | undefined, start: string, end: string) =>
  jsonl(
    { type: 'mode', mode: 'normal' },
    { type: 'user', cwd, timestamp: start, message: { content: 'quoting "cwd":"nope" and "timestamp":"nope"' } },
    ...(title ? [{ type: 'ai-title', aiTitle: title }] : []),
    { type: 'assistant', cwd, timestamp: end },
  );

test('parseTranscript: first cwd and timestamp, last timestamp, latest title', () => {
  const text =
    jsonl(
      { type: 'attachment', hook: { cwd: 'C:/nested' } },
      { type: 'user', cwd: 'C:\\work', timestamp: '2026-10-01T10:00:00.000Z' },
      { type: 'ai-title', aiTitle: 'First guess' },
      { type: 'ai-title', aiTitle: 'Better\ntitle' },
      { type: 'assistant', timestamp: '2026-10-01T11:30:00.000Z' },
    ) + '{"type":"assistant","timestamp":"2026-10-01T11:31';
  assert.deepEqual(parseTranscript(text, 's1'), {
    id: 's1',
    cwd: 'C:\\work',
    title: 'Better title',
    start: '2026-10-01T10:00:00.000Z',
    end: '2026-10-01T11:30:00.000Z',
  });
});

test('parseTranscript: falls back to the last prompt, skips sessions with neither', () => {
  const base = { type: 'user', cwd: 'C:/w', timestamp: '2026-10-01T10:00:00.000Z' };
  assert.equal(parseTranscript(jsonl(base, { type: 'last-prompt', lastPrompt: 'fix it' }), 's')?.title, 'fix it');
  assert.equal(parseTranscript(jsonl(base), 's'), undefined);
});

test('encodeCwd matches Claude Code folder names, lowercased', () => {
  assert.equal(
    encodeCwd("C:\\Users\\Nick\\Projects\\Mods\\Project Zomboid\\Nick's Rideable Elevators"),
    "c--users-nick-projects-mods-project-zomboid-nick-s-rideable-elevators",
  );
  assert.equal(encodeCwd('C:/Users/Nick'), encodeCwd('C:\\Users\\Nick'));
});

test('duration', () => {
  assert.equal(duration('2026-10-01T10:00:00Z', '2026-10-01T10:37:20Z'), '37m');
  assert.equal(duration('2026-10-01T10:00:00Z', '2026-10-01T13:05:00Z'), '3h05');
  assert.equal(duration('2026-10-01T10:00:00Z', '2026-10-03T09:00:00Z'), '2d');
});

let claude: string;
beforeEach(() => (claude = mkdtempSync(join(tmpdir(), 'belay-claude-'))));
afterEach(() => rmSync(claude, { recursive: true, force: true }));

function session(cwd: string, id: string, title: string | undefined, mtime: number) {
  const dir = join(claude, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(file, transcript(cwd, title, '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z'));
  utimesSync(file, mtime, mtime);
}

test('recentSessions: newest first, mapped by launch cwd, filtered and limited', () => {
  const projects: Project[] = [
    { key: 'pi', name: 'Pixel Imperium', paths: ['C:/Games/Pixel Imperium'], status: 'active', focus: false, body: '' },
  ];
  session('C:\\Games\\Pixel Imperium', 'a', 'Old', 1000);
  session('C:\\Games\\Pixel Imperium\\src', 'b', 'Newer, in a subdir', 3000);
  session('C:\\Games\\Pixel Imperium Two', 'c', 'Sibling folder', 4000);
  session('C:\\Games', 'd', 'Parent folder', 5000);
  session('C:\\Games\\Pixel Imperium', 'e', undefined, 6000);

  const all = recentSessions(claude, projects, { limit: 10 });
  assert.deepEqual(all.map((s) => [s.id, s.project]), [['d', undefined], ['c', undefined], ['b', 'pi'], ['a', 'pi']]);

  const pi = recentSessions(claude, projects, { project: projects[0], limit: 10 });
  assert.deepEqual(pi.map((s) => s.id), ['b', 'a']);
  assert.deepEqual(recentSessions(claude, projects, { project: projects[0], limit: 1 }).map((s) => s.id), ['b']);
  assert.deepEqual(recentSessions(claude, projects, { project: projects[0], limit: 5, exclude: 'b' }).map((s) => s.id), ['a']);
});
