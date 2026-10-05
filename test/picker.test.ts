import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkCandidates, pickerOptions } from '../src/picker.ts';

const candidates = [
  { id: 'ABC-1', title: 'Fix the parser' },
  { id: 'TRK-2', title: 'Parser docs' },
  { id: 'ABC-12', title: 'Ship it' },
  { id: 'TRK-3' },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test('pickerOptions matches ID or title, case-insensitively', () => {
  assert.deepEqual(ids(pickerOptions(candidates, 'PARSER')), ['ABC-1', 'TRK-2']);
  assert.deepEqual(ids(pickerOptions(candidates, ' abc-1')), ['ABC-1', 'ABC-12']);
  assert.deepEqual(ids(pickerOptions(candidates, '')), ['ABC-1', 'TRK-2', 'ABC-12', 'TRK-3']);
});

test('pickerOptions drops excluded IDs and puts the preferred project first', () => {
  assert.deepEqual(ids(pickerOptions(candidates, '', { exclude: ['ABC-1'] })), ['TRK-2', 'ABC-12', 'TRK-3']);
  assert.deepEqual(ids(pickerOptions(candidates, '', { preferProject: 'trk' })), ['TRK-2', 'TRK-3', 'ABC-1', 'ABC-12']);
  assert.deepEqual(ids(pickerOptions(candidates, 'parser', { preferProject: 'TRK', exclude: ['TRK-2'] })), ['ABC-1']);
});

test('linkCandidates keeps the project minus dropped, by status then most recently updated, plus the current link', () => {
  const t = (id: string, status: string, updated: string, project = 'TRK') => ({ id, project, status, updated });
  const issues = [
    t('TRK-1', 'done', '2026-10-05'),
    t('TRK-2', 'idea', '2026-10-01'),
    t('TRK-3', 'todo', '2026-10-01'),
    t('TRK-4', 'todo', '2026-10-04'),
    t('TRK-5', 'doing', '2026-09-01'),
    t('TRK-6', 'dropped', '2026-10-05'),
    t('ABC-1', 'doing', '2026-10-05', 'ABC'),
  ];
  assert.deepEqual(ids(linkCandidates(issues, 'TRK')), ['TRK-5', 'TRK-4', 'TRK-3', 'TRK-2', 'TRK-1']);
  assert.deepEqual(ids(linkCandidates(issues, 'TRK', 'TRK-6')), ['TRK-5', 'TRK-4', 'TRK-3', 'TRK-2', 'TRK-1', 'TRK-6']);
});
