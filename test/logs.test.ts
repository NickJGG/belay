import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { firstLine, loadLog, loadLogs, logFile, parseLog, parseLogAddress, saveLog, serializeLog, type LogEntry } from '../src/logs.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({ project: 'JOB', at: '2026-10-05T10:00', by: 'user', text: 'did a thing', ...over });

test('log entries round-trip with optional fields, and omit unset ones', () => {
  const entries = [
    entry({ kind: 'applied', count: 2, minutes: 40, issue: 'JOB-3', text: 'Acme\nand Foo' }),
    entry({ by: 'claude', session: 'abc', text: '"quoted": text' }),
  ];
  assert.deepEqual(parseLog(serializeLog(entries), 'x'), entries);
  assert.doesNotMatch(serializeLog([entry()]), /kind|count|minutes|issue|session/);
});

test('parseLog canonicalises keys and rejects bad entries', () => {
  assert.deepEqual(parseLog('entries:\n  - {project: job, at: 2026-10-05T10:00, by: user, text: x, issue: job-1}\n', 'x'), [
    { project: 'JOB', at: '2026-10-05T10:00', by: 'user', text: 'x', issue: 'JOB-1' },
  ]);
  assert.deepEqual(parseLog('', 'x'), []);
  assert.throws(() => parseLog('entries: {}', 'f'), /f: 'entries' must be a list/);
  assert.throws(() => parseLog('entries: [{project: JOB, at: 2026-10-05, by: user, text: x}]', 'f'), /f entry #1: 'at'/);
  assert.throws(() => parseLog('entries: [{project: JOB, at: 2026-10-05T10:00, by: user, text: x, count: 0}]', 'f'), /'count' must be a positive integer/);
  assert.throws(() => parseLog('entries: [{project: JOB, at: 2026-10-05T10:00, by: bob, text: x}]', 'f'), /'by' must be one of/);
});

test('saveLog creates the dir, and removes the file when the day is emptied', () => {
  saveLog(dir, '2026-10-05', [entry()]);
  assert.deepEqual(loadLog(dir, '2026-10-05'), [entry()]);
  saveLog(dir, '2026-10-05', []);
  assert.equal(existsSync(logFile(dir, '2026-10-05')), false);
  assert.deepEqual(loadLog(dir, '2026-10-05'), []);
});

test('loadLogs reads only the days in range, oldest first, with day and position', () => {
  assert.deepEqual(loadLogs(dir, '2026-10-01', '2026-10-31'), []);
  saveLog(dir, '2026-10-06', [entry({ text: 'c' })]);
  saveLog(dir, '2026-10-04', [entry({ text: 'a' }), entry({ text: 'b' })]);
  saveLog(dir, '2026-09-30', [entry({ text: 'old' })]);
  writeFileSync(join(dir, 'log', 'notes.txt'), 'ignored');
  mkdirSync(join(dir, 'log', 'sub.yaml'));
  writeFileSync(logFile(dir, '2026-09-01'), 'not: [valid');
  const got = loadLogs(dir, '2026-10-01', '2026-10-06').map((e) => [e.day, e.n, e.text]);
  assert.deepEqual(got, [
    ['2026-10-04', 1, 'a'],
    ['2026-10-04', 2, 'b'],
    ['2026-10-06', 1, 'c'],
  ]);
});

test('parseLogAddress reads <day>/<n>', () => {
  assert.deepEqual(parseLogAddress('2026-10-05/3'), { day: '2026-10-05', n: 3 });
  assert.deepEqual(parseLogAddress('2026-10-05/#2'), { day: '2026-10-05', n: 2 });
  assert.throws(() => parseLogAddress('2026-10-05/0'), /<YYYY-MM-DD>\/<n>/);
  assert.throws(() => parseLogAddress('10-05/1'), /<YYYY-MM-DD>\/<n>/);
});

test('firstLine splits off the first line and says whether more follows', () => {
  assert.deepEqual(firstLine('one'), { line: 'one', more: false });
  assert.deepEqual(firstLine('one\r\n\ntwo'), { line: 'one', more: true });
  assert.deepEqual(firstLine('one\n  \n'), { line: 'one', more: false });
});
