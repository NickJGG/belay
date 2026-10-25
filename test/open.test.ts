import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { linkedPath } from '../src/open.ts';

const dirs = { data: resolve('/data'), grills: resolve('/grills') };

test('file resolves to the issue file', () => {
  assert.equal(linkedPath({ id: 'TRK-1' }, 'file', dirs), join(dirs.data, 'issues', 'trk-1.md'));
});

test('grill resolves to its session file in the grills dir', () => {
  assert.equal(linkedPath({ id: 'BEL-7', grill: 'some-topic' }, 'grill', dirs), join(dirs.grills, 'some-topic', 'some-topic.md'));
});

test('plan resolves to an absolute path', () => {
  assert.equal(linkedPath({ id: 'TRK-1', plan: 'C:/plans/p.md' }, 'plan', dirs), resolve('C:/plans/p.md'));
});

test('undefined when the issue has no grill or plan', () => {
  assert.equal(linkedPath({ id: 'TRK-1' }, 'grill', dirs), undefined);
  assert.equal(linkedPath({ id: 'TRK-1', grill: 'x' }, 'plan', dirs), undefined);
});
