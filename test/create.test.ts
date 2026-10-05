import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATE_TYPES, EMPTY_CREATE, cycleType, isBlankCreate, logText, openDraft, switchKeyDelta, type OpenContext } from '../src/create.ts';

const ctx = (o: Partial<OpenContext> = {}): OpenContext => ({
  type: 'todo',
  pageProject: undefined,
  lastProject: undefined,
  lastKind: undefined,
  openProjects: [{ key: 'WEB', kinds: ['pr', 'review'] }, { key: 'CLI' }],
  ...o,
});

test('the empty draft is blank and opens on todo', () => {
  assert.equal(EMPTY_CREATE.type, 'todo');
  assert.equal(isBlankCreate(EMPTY_CREATE), true);
});

test('remembered defaults leave a draft blank, anything typed or chosen does not', () => {
  assert.equal(isBlankCreate({ ...EMPTY_CREATE, project: 'WEB', kind: 'pr', type: 'log' }), true);
  for (const patch of [{ text: 'x' }, { body: 'x' }, { blockers: ['WEB-1'] }, { high: true }, { count: '2' }, { day: 'yesterday' }]) {
    assert.equal(isBlankCreate({ ...EMPTY_CREATE, ...patch }), false, JSON.stringify(patch));
  }
});

test('a log entry joins the summary and description with a blank line', () => {
  assert.equal(logText({ text: ' did it ', body: '' }), 'did it');
  assert.equal(logText({ text: 'did it', body: '  \n ' }), 'did it');
  assert.equal(logText({ text: 'did it', body: '\r\nfirst\r\n\r\nsecond\n' }), 'did it\n\nfirst\n\nsecond');
});

test('cycleType wraps round in switcher order', () => {
  assert.deepEqual(CREATE_TYPES, ['todo', 'idea', 'log']);
  assert.equal(cycleType('todo', 1), 'idea');
  assert.equal(cycleType('log', 1), 'todo');
  assert.equal(cycleType('todo', -1), 'log');
  assert.equal(cycleType('idea', -1), 'todo');
});

test('an unsaved draft wins over the requested type and defaults', () => {
  const d = { ...EMPTY_CREATE, type: 'idea' as const, text: 'half done', project: 'CLI' };
  assert.equal(openDraft(d, ctx({ type: 'log', pageProject: 'WEB' })), d);
});

test('a blank draft takes the requested type and the page project, then the last one', () => {
  assert.deepEqual(openDraft(EMPTY_CREATE, ctx({ type: 'log', pageProject: 'WEB', lastProject: 'CLI' })), { ...EMPTY_CREATE, type: 'log', project: 'WEB' });
  assert.equal(openDraft(EMPTY_CREATE, ctx({ lastProject: 'CLI' })).project, 'CLI');
  assert.equal(openDraft(EMPTY_CREATE, ctx({ pageProject: 'GONE', lastProject: 'CLI' })).project, 'CLI');
  assert.equal(openDraft(EMPTY_CREATE, ctx({ lastProject: 'ARCHIVED' })).project, '');
  assert.equal(openDraft({ ...EMPTY_CREATE, type: 'log', project: 'WEB' }, ctx()).type, 'todo');
});

test('the last kind is kept only when it belongs to the chosen project', () => {
  assert.equal(openDraft(EMPTY_CREATE, ctx({ lastProject: 'WEB', lastKind: 'pr' })).kind, 'pr');
  assert.equal(openDraft(EMPTY_CREATE, ctx({ pageProject: 'CLI', lastProject: 'WEB', lastKind: 'pr' })).kind, '');
  assert.equal(openDraft(EMPTY_CREATE, ctx({ lastProject: 'WEB', lastKind: 'gone' })).kind, '');
  assert.equal(openDraft({ ...EMPTY_CREATE, kind: 'stale' }, ctx()).kind, '');
});

test('Ctrl+[ and Ctrl+] switch, with no Cmd or Alt', () => {
  const key = (code: string, o = {}) => ({ code, ctrl: true, meta: false, alt: false, ...o });
  assert.equal(switchKeyDelta(key('BracketRight')), 1);
  assert.equal(switchKeyDelta(key('BracketLeft')), -1);
  assert.equal(switchKeyDelta(key('BracketRight', { ctrl: false })), undefined);
  assert.equal(switchKeyDelta(key('BracketLeft', { ctrl: false, meta: true })), undefined);
  assert.equal(switchKeyDelta(key('BracketRight', { meta: true })), undefined);
  assert.equal(switchKeyDelta(key('BracketRight', { alt: true })), undefined);
  assert.equal(switchKeyDelta(key('KeyK')), undefined);
});
