const test = require('node:test');
const assert = require('node:assert');
const { schedule, retrievability } = require('../../plugin/scripts/fsrs');

const NEW = { due: '2026-01-01', s: 0, d: 0, reps: 0, lapses: 0, last: null, state: 'new' };

function run(ratings, start = '2026-01-01') {
  let state = NEW, date = start;
  const intervals = [];
  for (const r of ratings) {
    const out = schedule(state, r, date);
    intervals.push(out.interval);
    state = out.state;
    date = state.due;
  }
  return { state, intervals };
}

test('first review uses default initial stabilities and orders intervals', () => {
  const ivl = ['again', 'hard', 'good', 'easy'].map(r => schedule(NEW, r, '2026-01-01').interval);
  assert.deepStrictEqual(ivl, [1, 1, 2, 8]);
  assert.strictEqual(schedule(NEW, 'good', '2026-01-01').state.s, 2.3065);
});

test('intervals grow on repeated good', () => {
  const { intervals } = run(['good', 'good', 'good', 'good', 'good']);
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i] > intervals[i - 1], intervals.join(','));
});

test('easy grows faster than good', () => {
  const good = run(['good', 'good', 'good']).intervals.at(-1);
  const easy = run(['good', 'good', 'easy']).intervals.at(-1);
  assert.ok(easy > good, `${easy} <= ${good}`);
});

test('again resets a mature card to a short interval and counts a lapse', () => {
  const mature = run(['good', 'good', 'good', 'good']);
  const lapse = schedule(mature.state, 'again', mature.state.due);
  assert.strictEqual(mature.intervals.at(-1), 163);
  assert.strictEqual(lapse.interval, 5);
  assert.strictEqual(lapse.state.s, 4.7161);
  assert.strictEqual(lapse.state.lapses, 1);
  assert.strictEqual(lapse.state.state, 'relearning');
});

test('due date is the review date plus the interval', () => {
  const out = schedule(NEW, 'easy', '2026-12-30');
  assert.strictEqual(out.state.due, '2027-01-07');
  assert.strictEqual(out.state.last, '2026-12-30');
});

test('retrievability is 0.9 after one stability of elapsed time', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
});

test('unknown rating throws', () => {
  assert.throws(() => schedule(NEW, 'meh'));
});
