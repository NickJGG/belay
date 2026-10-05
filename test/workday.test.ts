import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, isDay, parseDay, weekDays, weekStart, workDay, workDayOf } from '../src/workday.ts';

test('workDay ends at 4am local', () => {
  assert.equal(workDay(new Date(2026, 9, 6, 3, 59)), '2026-10-05');
  assert.equal(workDay(new Date(2026, 9, 6, 4, 0)), '2026-10-06');
  assert.equal(workDay(new Date(2026, 9, 1, 1, 0)), '2026-09-30');
  assert.equal(workDay(new Date(2026, 0, 1, 2, 0)), '2025-12-31');
  assert.equal(workDayOf('2026-10-06T03:59'), '2026-10-05');
  assert.equal(workDayOf('2026-10-06T23:59'), '2026-10-06');
});

test('weeks run Monday to Sunday', () => {
  assert.equal(weekStart('2026-10-05'), '2026-10-05');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-01'), '2026-09-28');
  assert.deepEqual(weekDays('2026-10-08'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
});

test('day arithmetic crosses months, years and DST', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(daysBetween('2026-10-05', '2026-10-19'), 14);
  assert.equal(daysBetween('2026-10-19', '2026-10-05'), -14);
  assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31);
});

test('parseDay takes today, yesterday or a real date, relative to the work day', () => {
  const lateNight = new Date(2026, 9, 6, 2, 0);
  assert.equal(parseDay('today', lateNight), '2026-10-05');
  assert.equal(parseDay('Yesterday', lateNight), '2026-10-04');
  assert.equal(parseDay('2026-10-01'), '2026-10-01');
  assert.throws(() => parseDay('2026-02-30'), /date must be/);
  assert.throws(() => parseDay('last week'), /date must be/);
  assert.equal(isDay('2026-02-28'), true);
  assert.equal(isDay('2026-2-28'), false);
});
