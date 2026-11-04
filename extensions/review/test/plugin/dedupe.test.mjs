import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run, runJson } from './helpers.mjs';

const finding = (key, severity, reviewer, extra = {}) => ({ root_cause_key: key, severity, reviewer, pass: 1, evidence: 'x', ...extra });

test('groups by normalized key, keeping every finding', () => {
  const groups = runJson('dedupe.mjs', [
    finding('missing-null-check:src/a.ts:load', 'IMPORTANT', '02-bugs-security'),
    finding('  Missing-Null-Check:SRC\\a.ts:LOAD ', 'CRITICAL', '07-performance'),
    finding('dead-code:src/b.ts:old', 'DEBT', '03-dry-smells'),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].root_cause_key, 'missing-null-check:src/a.ts:load');
  assert.equal(groups[0].findings.length, 2);
  assert.equal(groups[0].severity, 'CRITICAL');
  assert.deepEqual(groups[0].found_by, ['02-bugs-security', '07-performance']);
});

test('found_by counts a reviewer once across passes and chunks', () => {
  const [group] = runJson('dedupe.mjs', [
    finding('perf:a.ts:f', 'IMPORTANT', '02-bugs-security', { pass: 1 }),
    finding('perf:a.ts:f', 'IMPORTANT', '02-bugs-security', { pass: 2 }),
  ]);
  assert.deepEqual(group.found_by, ['02-bugs-security']);
  assert.equal(group.findings.length, 2);
});

test('groups sort by highest severity, then first seen', () => {
  const groups = runJson('dedupe.mjs', [
    finding('a', 'QUESTION', 'r'), finding('b', 'DEBT', 'r'), finding('c', 'CRITICAL', 'r'), finding('d', 'DEBT', 'r'),
  ]);
  assert.deepEqual(groups.map((g) => g.root_cause_key), ['c', 'b', 'd', 'a']);
});

test('nothing is capped', () => {
  const many = Array.from({ length: 30 }, (_, i) => finding(`style:f${i}`, 'SUGGESTED', 'r'));
  assert.equal(runJson('dedupe.mjs', many).length, 30);
});

test('empty input yields an empty array', () => {
  assert.deepEqual(runJson('dedupe.mjs', []), []);
});

test('malformed input exits 2', () => {
  assert.equal(run('dedupe.mjs', { input: 'nope' }).code, 2);
  assert.equal(run('dedupe.mjs', { input: '{}' }).code, 2);
  assert.equal(run('dedupe.mjs', { input: JSON.stringify([{ severity: 'DEBT' }]) }).code, 2);
  assert.equal(run('dedupe.mjs', { input: JSON.stringify([{ root_cause_key: '  ' }]) }).code, 2);
});
