import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewCounts, verdictText, withDecision, withOutcome, withTracked, type Decisions } from '../cli/state.ts';
import { finding } from './fixtures.ts';

const done = { status: 'done' } as const;
const findings = [finding(1, 'critical'), finding(2, 'important'), finding(3, 'debt'), finding(4, 'refuted')];

test('a review needs you while a must-fix finding is undecided or a fix is unapplied', () => {
  assert.deepEqual(reviewCounts(done, findings, {}), { state: 'needs-you', mustFix: 2, undecided: 2, toFix: 0 });
  let d: Decisions = withDecision({}, [1, 2], 'skip', 'user', 't1');
  assert.equal(reviewCounts(done, findings, d).state, 'done');
  d = withDecision(d, [3], 'fix', 'user', 't2');
  assert.deepEqual(reviewCounts(done, findings, d), { state: 'needs-you', mustFix: 2, undecided: 0, toFix: 1 });
  d = withOutcome(d, [3], 'manual', 'claude', 't3', 'code changed since the review');
  assert.equal(reviewCounts(done, findings, d).state, 'done');
  assert.equal(reviewCounts({ status: 'running' }, findings, {}).state, 'running');
  assert.equal(reviewCounts({ status: 'stopped' }, [], {}).state, 'done');
});

test('the verdict counts must-fix findings and the rest, never the refuted', () => {
  assert.equal(verdictText(findings), '2 must-fix · 1 more');
  assert.equal(verdictText([finding(1, 'debt')]), 'Nothing must be fixed · 1 more');
  assert.equal(verdictText([]), 'Nothing must be fixed');
});

test('a new decision drops an old outcome; clear keeps a tracked issue so it is not tracked twice', () => {
  let d = withOutcome({}, [1], 'applied', 'claude', 't1');
  assert.deepEqual(d[1], { decision: 'fix', outcome: 'applied', at: 't1', by: 'claude' });
  d = withDecision(d, [1], 'skip', 'user', 't2');
  assert.deepEqual(d[1], { decision: 'skip', at: 't2', by: 'user' });
  d = withTracked(d, 2, 'BEL-9', 'user', 't3');
  d = withDecision(d, [1, 2], 'clear', 'user', 't4');
  assert.deepEqual(d, { 2: { issue: 'BEL-9', at: 't4', by: 'user' } });
  assert.equal(reviewCounts(done, [finding(2, 'important')], d).undecided, 1);
});
