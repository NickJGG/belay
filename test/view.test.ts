import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD_ORDER, VIEW_STATUSES, toggleStatus } from '../src/view.ts';

test('toggleStatus keeps board order and drops the default set', () => {
  assert.equal(toggleStatus(['doing', 'todo', 'done'], 'dropped'), 'doing,todo,done,dropped');
  assert.equal(toggleStatus(['dropped', 'todo', 'doing', 'done'], 'dropped'), undefined);
  assert.equal(toggleStatus(['done', 'todo'], 'doing'), undefined);
  assert.equal(toggleStatus(['todo', 'doing', 'done'], 'doing'), 'todo,done');
  assert.equal(toggleStatus(['todo', 'doing', 'done'], 'todo'), 'doing,done');
  assert.equal(toggleStatus(['todo'], 'todo'), undefined);
});

test('VIEW_STATUSES is BOARD_ORDER without idea', () => {
  assert.deepEqual(VIEW_STATUSES, BOARD_ORDER.filter((s) => s !== 'idea'));
});
