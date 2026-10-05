import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUS_KEYS, keyCommand, pageProject, pageIssue, step, type KeyPress } from '../src/keys.ts';
import { ISSUE_STATUSES } from '../src/store.ts';

const press = (key: string, o: Partial<KeyPress> = {}): KeyPress => ({ key, ctrl: false, meta: false, alt: false, focus: 'none', ...o });

test('single keys map to commands', () => {
  assert.deepEqual(keyCommand(press('c')), { kind: 'create' });
  assert.deepEqual(keyCommand(press('l')), { kind: 'log' });
  assert.deepEqual(keyCommand(press('j')), { kind: 'move', delta: 1 });
  assert.deepEqual(keyCommand(press('k')), { kind: 'move', delta: -1 });
  assert.deepEqual(keyCommand(press('e')), { kind: 'edit' });
  assert.deepEqual(keyCommand(press('/')), { kind: 'palette' });
  assert.deepEqual(keyCommand(press('?')), { kind: 'help' });
  assert.deepEqual(keyCommand(press('Escape')), { kind: 'clear' });
  assert.equal(keyCommand(press('x')), undefined);
});

test('1–5 set the status in board order', () => {
  assert.deepEqual(STATUS_KEYS, ISSUE_STATUSES);
  assert.deepEqual(
    ['1', '2', '3', '4', '5'].map((k) => keyCommand(press(k))),
    ['idea', 'todo', 'doing', 'done', 'dropped'].map((status) => ({ kind: 'status', status })),
  );
  assert.equal(keyCommand(press('0')), undefined);
  assert.equal(keyCommand(press('6')), undefined);
});

test('typing disables everything but Ctrl/Cmd+K', () => {
  for (const k of ['c', 'l', 'j', '1', '/', '?', 'Escape', 'Enter']) assert.equal(keyCommand(press(k, { focus: 'text' })), undefined, k);
  assert.deepEqual(keyCommand(press('k', { focus: 'text', ctrl: true })), { kind: 'palette' });
  assert.deepEqual(keyCommand(press('K', { meta: true })), { kind: 'palette' });
});

test('modified keys are left to the browser', () => {
  assert.equal(keyCommand(press('c', { ctrl: true })), undefined);
  assert.equal(keyCommand(press('1', { alt: true })), undefined);
  assert.equal(keyCommand(press('k', { ctrl: true, alt: true })), undefined);
});

test('Enter opens unless a control has focus', () => {
  assert.deepEqual(keyCommand(press('Enter')), { kind: 'open' });
  assert.equal(keyCommand(press('Enter', { focus: 'control' })), undefined);
  assert.deepEqual(keyCommand(press('j', { focus: 'control' })), { kind: 'move', delta: 1 });
});

test('step walks the list and stops at the ends', () => {
  const ids = ['a-1', 'a-2', 'a-3'];
  assert.equal(step(ids, undefined, 1), 'a-1');
  assert.equal(step(ids, undefined, -1), 'a-3');
  assert.equal(step(ids, 'a-1', 1), 'a-2');
  assert.equal(step(ids, 'a-3', 1), 'a-3');
  assert.equal(step(ids, 'a-1', -1), 'a-1');
  assert.equal(step(ids, 'gone-9', 1), 'a-1');
  assert.equal(step([], 'a-1', 1), undefined);
});

test('pages name their issue and project', () => {
  assert.equal(pageIssue('/i/web-app-12'), 'web-app-12');
  assert.equal(pageIssue('/p/web-app'), undefined);
  assert.equal(pageProject('/i/web-app-12'), 'web-app');
  assert.equal(pageProject('/p/web-app'), 'web-app');
  assert.equal(pageProject('/issues'), undefined);
  assert.equal(pageProject('/p/'), undefined);
});
