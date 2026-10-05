import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, parseAt } from '../src/time.ts';

const now = new Date(2026, 9, 4, 12, 30);

test('parseAt reads local time', () => {
  assert.deepEqual(parseAt('2026-10-04T09:05'), new Date(2026, 9, 4, 9, 5));
});

test('ago steps from minutes to dates', () => {
  assert.equal(ago('2026-10-04T12:30', now), 'just now');
  assert.equal(ago('2026-10-04T12:45', now), 'just now');
  assert.equal(ago('2026-10-04T12:25', now), '5m ago');
  assert.equal(ago('2026-10-04T11:30', now), '1h ago');
  assert.equal(ago('2026-10-03T12:31', now), '23h ago');
  assert.equal(ago('2026-10-03T12:30', now), '1d ago');
  assert.equal(ago('2026-09-28T12:30', now), '6d ago');
  assert.equal(ago('2026-09-27T12:30', now), 'Sep 27');
  assert.equal(ago('2025-12-31T23:59', now), 'Dec 31, 2025');
});
