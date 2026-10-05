import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { linkedPath } from '../src/open.ts';

const dirs = { data: resolve('/data'), claude: resolve('/claude') };

test('file resolves to the issue file', () => {
  assert.equal(linkedPath({ id: 'TRK-1' }, 'file', dirs), join(dirs.data, 'issues', 'trk-1.md'));
});

test('grill resolves to its session file', () => {
  assert.equal(linkedPath({ id: 'TRK-1', grill: 'some-topic' }, 'grill', dirs), join(dirs.claude, 'skills', 'grill', 'sessions', 'some-topic.md'));
});

test('plan resolves to an absolute path', () => {
  assert.equal(linkedPath({ id: 'TRK-1', plan: 'C:/plans/p.md' }, 'plan', dirs), resolve('C:/plans/p.md'));
});

test('undefined when the issue has no grill or plan', () => {
  assert.equal(linkedPath({ id: 'TRK-1' }, 'grill', dirs), undefined);
  assert.equal(linkedPath({ id: 'TRK-1', grill: 'x' }, 'plan', dirs), undefined);
});
