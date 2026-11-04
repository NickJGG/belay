import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test, type TestContext } from 'node:test';
import { addProject, Ctx } from '../../../src/ops.ts';
import type { Project } from '../../../src/store.ts';
import { cmdReview, digestLines, searchLines } from '../cli/cli.ts';
import { manifest } from '../cli/manifest.ts';
import { loadReviews } from '../cli/reviews.ts';
import type { Finding, Review } from '../cli/state.ts';
import { finding } from './fixtures.ts';

let dir: string;
const savedData = process.env.BELAY_DATA;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
  process.env.BELAY_DATA = dir;
  addProject(new Ctx(dir), { key: 'BEL', name: 'Belay', paths: ['C:/x'] });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedData === undefined) delete process.env.BELAY_DATA;
  else process.env.BELAY_DATA = savedData;
});

function seed(id: string, over: Partial<Review> = {}, findings: Finding[] = [finding(1, 'critical'), finding(2, 'debt')]): string {
  const folder = join(dir, 'reviews', id);
  mkdirSync(folder, { recursive: true });
  const review: Review = {
    id,
    project: 'BEL',
    root: 'C:/x',
    target: 'last commit',
    ref: 'abc1234',
    mode: 'diff',
    tier: 'small',
    seed: 1,
    preview: null,
    started: '2026-11-04T15:30:00.000Z',
    finished: '2026-11-04T15:42:00.000Z',
    status: 'done',
    partial: null,
    campaign: null,
    stages: [],
    ...over,
  };
  writeFileSync(join(folder, 'review.json'), JSON.stringify(review));
  writeFileSync(join(folder, 'findings.json'), JSON.stringify(findings));
  return folder;
}

function output(t: TestContext, argv: string[]): string {
  const lines: string[] = [];
  t.mock.method(console, 'log', (m: string) => lines.push(m));
  cmdReview(argv);
  t.mock.restoreAll();
  return lines.join('\n');
}

const decisions = (id: string) => JSON.parse(readFileSync(join(dir, 'reviews', id, 'decisions.json'), 'utf8'));

test('list shows what needs you, newest first, and filters by project or Unfiled', (t) => {
  seed('review-a', { started: '2026-11-01T10:00:00.000Z' });
  seed('review-b', { project: null, target: 'snapshot src', ref: null, campaign: { unit: 4, of: 12 } }, [finding(1, 'debt')]);
  seed('review-c', { status: 'running', started: '2026-11-05T10:00:00.000Z' }, []);
  mkdirSync(join(dir, 'reviews', 'campaigns', 'repo-123'), { recursive: true });
  const lines = output(t, ['list']).split('\n');
  assert.deepEqual(lines.map((l) => l.split(/\s{2,}/).slice(0, 2)), [['review-c', 'running'], ['review-b', 'done'], ['review-a', 'needs you']]);
  assert.match(lines[1], /snapshot src {2,}Nothing must be fixed · 1 more {2}campaign · 4 of 12/);
  assert.match(lines[2], /last commit \(abc1234\) {2}1 must-fix · 1 more/);
  assert.deepEqual(output(t, ['list', '--project', 'unfiled']).split(/\s+/)[0], 'review-b');
  assert.equal(output(t, ['list', '--project', 'nope']), 'no reviews');
});

test('decide queues fixes and skips by report number; clear undoes; outcome records how fixes went', (t) => {
  seed('review-a');
  assert.equal(output(t, ['decide', 'review-a', '#1', '2', 'fix']), 'review-a: #1 #2 fix');
  assert.deepEqual(Object.keys(decisions('review-a')), ['1', '2']);
  assert.match(output(t, ['list']), /needs you.*1 to fix|needs you.*2 to fix/);
  output(t, ['decide', 'review-a', '2', 'clear']);
  assert.deepEqual(Object.keys(decisions('review-a')), ['1']);
  output(t, ['outcome', 'review-a', '1', 'manual', '--note', 'code changed since the review']);
  assert.equal(decisions('review-a')[1].outcome, 'manual');
  assert.match(output(t, ['list']), /review-a {2}done/);
  assert.match(output(t, ['show', 'review-a']), /#1 +critical +Finding 1 {2}a\.ts:1 {2}\[manual follow-up: code changed since the review\]/);
  assert.throws(() => cmdReview(['decide', 'review-a', '9', 'fix']), /no finding #9/);
  assert.throws(() => cmdReview(['decide', 'review-a', '1', 'track']), /decision/);
  assert.throws(() => cmdReview(['decide', 'review-a', 'x', 'fix']), /not a finding number/);
});

test("a running review takes no decisions; show lists its stages", (t) => {
  seed('review-r', {
    status: 'running',
    finished: null,
    stages: [
      { name: 'plan', status: 'done', started: 'x', finished: 'x' },
      { name: 'reviewers', status: 'doing', started: 'x', finished: null, done: 5, of: 8 },
    ],
  }, []);
  assert.throws(() => cmdReview(['decide', 'review-r', '1', 'fix']), /still running/);
  assert.match(output(t, ['show', 'review-r']), /stages: +plan done · reviewers 5\/8/);
});

test('track adds an idea in the review project, links the review and refuses a second time', (t) => {
  seed('review-a');
  assert.match(output(t, ['track', 'review-a', '1']), /^added BEL-1 "Finding 1" \(idea\) for review-a #1$/);
  const issue = new Ctx(dir).issue('BEL-1');
  assert.equal(issue.status, 'idea');
  assert.equal(issue.source, 'claude');
  assert.match(issue.body, /`a\.ts:1`, finding #1 of review review-a \(last commit\): http:\/\/127\.0\.0\.1:\d+\/r\/review-a/);
  assert.match(issue.body, /Suggested fix: Fix it\./);
  assert.deepEqual({ ...decisions('review-a')[1], at: '' }, { decision: 'track', issue: 'BEL-1', at: '', by: decisions('review-a')[1].by });
  assert.throws(() => cmdReview(['track', 'review-a', '1']), /already tracked as BEL-1/);

  seed('review-u', { project: null });
  assert.throws(() => cmdReview(['track', 'review-u', '1']), /--project/);
  output(t, ['track', 'review-u', '1', '--project', 'bel']);
  assert.equal(decisions('review-u')[1].issue, 'BEL-2');
});

test('show --json, path and delete', (t) => {
  const folder = seed('review-a');
  const json = JSON.parse(output(t, ['show', 'review-a', '--json']));
  assert.equal(json.review.id, 'review-a');
  assert.deepEqual(json.counts, { state: 'needs-you', mustFix: 1, undecided: 1, toFix: 0 });
  assert.equal(output(t, ['path', 'review-a']), folder.replaceAll('\\', '/'));
  assert.equal(output(t, ['delete', 'review-a']), 'deleted review review-a');
  assert.equal(existsSync(folder), false);
  assert.throws(() => cmdReview(['show', 'review-a']), /no review 'review-a'/);
  assert.throws(() => cmdReview(['show', '../issues']), /not a review id/);
});

test('search finds reviews by target, ref or project; the digest names those that need you', () => {
  seed('review-a');
  seed('review-b', { target: 'PR #12', ref: null }, [finding(1, 'debt')]);
  const hits = searchLines(['abc1234'], dir);
  assert.equal(hits.length, 2);
  assert.match(hits[1], /^ {2}review-a/);
  assert.deepEqual(searchLines(['nothing'], dir), []);
  const project: Project = { key: 'BEL', name: 'Belay', paths: [], status: 'active', focus: true, body: '' };
  assert.deepEqual(digestLines(project, loadReviews(join(dir, 'reviews'))), ['review: 1 review needs you (review-a) (belay review list)']);
  assert.deepEqual(digestLines({ ...project, key: 'ELV' }, loadReviews(join(dir, 'reviews'))), []);
});

test('the manifest wires the command, search and digest', async () => {
  assert.equal(await manifest.cli!.commands!.review(), cmdReview);
  assert.equal(await manifest.cli!.search!(), searchLines);
  assert.ok(manifest.cli!.help!.commands!.every((c) => c.usage.startsWith('review ')));
});
