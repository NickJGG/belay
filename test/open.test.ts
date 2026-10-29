import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import type { ExtensionManifest } from '../src/extensions.ts';
import { linkedKinds, linkedPath } from '../src/open.ts';
import type { Issue } from '../src/store.ts';

const data = resolve('/data');

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: 'TRK-1',
  title: 't',
  project: 'TRK',
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-10-01',
  updated: '2026-10-01',
  comments: [],
  body: '',
  ...over,
});

const notes: ExtensionManifest = {
  id: 'grill',
  fields: [],
  skills: [],
  cli: { linked: { notes: async (t, dir) => (t.body ? join(dir, 'notes', `${t.id}.md`) : undefined) } },
};

test('file resolves to the issue file, with no extension active', async () => {
  assert.equal(await linkedPath(issue(), 'file', data, []), join(data, 'issues', 'trk-1.md'));
});

test("an extension's kind resolves through its slot, or undefined when the issue has none", async () => {
  assert.equal(await linkedPath(issue({ body: 'x' }), 'notes', data, [notes]), join(data, 'notes', 'TRK-1.md'));
  assert.equal(await linkedPath(issue(), 'notes', data, [notes]), undefined);
});

test('a kind no active extension offers is refused, naming the kinds there are', async () => {
  assert.deepEqual(linkedKinds([notes]), ['file', 'notes']);
  await assert.rejects(linkedPath(issue(), 'notes', data, []), /^Error: kind must be file$/);
  await assert.rejects(linkedPath(issue(), 'plan', data, [notes]), /kind must be file\|notes/);
});
