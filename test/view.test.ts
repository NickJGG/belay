import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toggleStatus } from '../src/view.ts';

test('toggleStatus keeps board order and drops the default set', () => {
  assert.equal(toggleStatus(['todo', 'doing', 'done'], 'dropped'), 'todo,doing,done,dropped');
  assert.equal(toggleStatus(['dropped', 'todo', 'doing', 'done'], 'dropped'), undefined);
  assert.equal(toggleStatus(['done', 'todo'], 'doing'), undefined);
  assert.equal(toggleStatus(['todo', 'doing', 'done'], 'doing'), 'todo,done');
  assert.equal(toggleStatus(['todo'], 'todo'), undefined);
});
