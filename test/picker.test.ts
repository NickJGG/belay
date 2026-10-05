import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickerOptions } from '../src/picker.ts';

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
