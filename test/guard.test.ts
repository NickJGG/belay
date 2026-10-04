import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostAllowed } from '../src/guard.ts';

test('only loopback hosts on the served port pass', () => {
  assert.ok(hostAllowed('127.0.0.1:4747', undefined, 'GET', 4747));
  assert.ok(hostAllowed('localhost:4747', undefined, 'GET', 4747));
  assert.ok(!hostAllowed('evil.test', undefined, 'GET', 4747));
  assert.ok(!hostAllowed('localhost:4748', undefined, 'GET', 4747));
  assert.ok(!hostAllowed(undefined, undefined, 'GET', 4747));
});

test('POST needs a matching Origin', () => {
  assert.ok(hostAllowed('127.0.0.1:4747', 'http://127.0.0.1:4747', 'POST', 4747));
  assert.ok(hostAllowed('127.0.0.1:4747', 'http://localhost:4747', 'POST', 4747));
  assert.ok(!hostAllowed('127.0.0.1:4747', undefined, 'POST', 4747));
  assert.ok(!hostAllowed('127.0.0.1:4747', 'http://evil.test', 'POST', 4747));
  assert.ok(!hostAllowed('127.0.0.1:4747', 'https://127.0.0.1:4747', 'POST', 4747));
});
