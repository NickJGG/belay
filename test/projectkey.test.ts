import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestKey } from '../src/projectkey.ts';

test('three letters from the name', () => {
  assert.equal(suggestKey('Portfolio site', []), 'PSI');
  assert.equal(suggestKey('Portfolio', []), 'POR');
  assert.equal(suggestKey('Rideable Elevators', []), 'REL');
  assert.equal(suggestKey('Turn off Fridges', []), 'TOF');
  assert.equal(suggestKey('The Art of War', []), 'AWA');
  assert.equal(suggestKey('Pixel-art tool v2', []), 'PAT');
  assert.equal(suggestKey('Go X', []), 'GOX');
});

test('four letters on a clash, then an error', () => {
  assert.equal(suggestKey('Portfolio', ['POR']), 'PORP');
  assert.equal(suggestKey('Portfolio', ['POR', 'PORP']), 'PORO');
  assert.throws(() => suggestKey('Abc', ['ABC', 'ABCA', 'ABCB', 'ABCC']), /pass a key/);
});

test('names with too few letters need an explicit key', () => {
  assert.throws(() => suggestKey('X1', []), /pass one/);
});
