import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { learningRoot } from '../cli/cli.ts';

test('learn runs in LEARNING_ROOT, else ~/Learning', () => {
  assert.equal(learningRoot({}, resolve('/home/me')), join(resolve('/home/me'), 'Learning'));
  assert.equal(learningRoot({ LEARNING_ROOT: 'D:/courses' }, resolve('/home/me')), 'D:/courses');
});
