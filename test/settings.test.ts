import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { loadSettings, saveSettings, settingsFile } from '../src/settings.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('defaults when the file is missing, empty or partial', () => {
  assert.deepEqual(loadSettings(dir), { accent: 'coral', theme: 'system' });
  writeFileSync(settingsFile(dir), '');
  assert.deepEqual(loadSettings(dir), { accent: 'coral', theme: 'system' });
  writeFileSync(settingsFile(dir), 'theme: dark\n');
  assert.deepEqual(loadSettings(dir), { accent: 'coral', theme: 'dark' });
});

test('round-trips', () => {
  saveSettings(dir, { accent: 'teal', theme: 'light' });
  assert.equal(readFileSync(settingsFile(dir), 'utf8'), 'accent: teal\ntheme: light\n');
  assert.deepEqual(loadSettings(dir), { accent: 'teal', theme: 'light' });
});

test('rejects a bad theme or accent', () => {
  writeFileSync(settingsFile(dir), 'theme: sepia\n');
  assert.throws(() => loadSettings(dir), /'theme' must be one of system\|dark\|light/);
  writeFileSync(settingsFile(dir), 'accent: 3\n');
  assert.throws(() => loadSettings(dir), /'accent' must be a non-empty string/);
  writeFileSync(settingsFile(dir), '- a\n');
  assert.throws(() => loadSettings(dir), /not a mapping/);
  assert.throws(() => saveSettings(dir, { accent: '', theme: 'dark' }), /'accent'/);
});
