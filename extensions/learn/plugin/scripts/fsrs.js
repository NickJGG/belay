#!/usr/bin/env node
/* FSRS-6 scheduler, day-granular, default parameters, no dependencies.
   Library: `const { schedule } = require('./fsrs')`; schedule(state, rating, today) returns
   { state, interval } where rating is again|hard|good|easy and dates are YYYY-MM-DD.
   CLI: `node fsrs.js <state json> <rating> [--date YYYY-MM-DD]` prints the next state. */

const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const RETENTION = 0.9;
const S_MIN = 0.001;
const S_MAX = 36500;
const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };

const DECAY = -W[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round4 = x => Math.round(x * 1e4) / 1e4;

const retrievability = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
const initStability = g => W[g - 1];
const initDifficulty = g => W[4] - Math.exp(W[5] * (g - 1)) + 1;

function nextDifficulty(d, g) {
  const damped = d + (-W[6] * (g - 3)) * (10 - d) / 9;
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}

function forgetStability(d, s, r) {
  const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(f, s / Math.exp(W[17] * W[18]));
}

function shortTermStability(s, g) {
  let inc = Math.exp(W[17] * (g - 3 + W[18])) * Math.pow(s, -W[19]);
  if (g >= 3) inc = Math.max(inc, 1);
  return s * inc;
}

const interval = s => clamp(Math.round(s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1)), 1, S_MAX);

const toDay = date => Math.round(Date.parse(date + 'T00:00:00Z') / 864e5);
const fromDay = n => new Date(n * 864e5).toISOString().slice(0, 10);
function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function schedule(state, rating, date = today()) {
  const g = RATINGS[rating];
  if (!g) throw new Error(`rating must be one of ${Object.keys(RATINGS).join('|')}`);
  const isNew = state.state === 'new' || !state.last;
  const elapsed = isNew ? 0 : Math.max(0, toDay(date) - toDay(state.last));

  /* All four outcomes are computed so intervals can be kept ordered (again <= hard < good < easy),
     as the reference implementations do. */
  const outcomes = [1, 2, 3, 4].map(k => {
    let s, d;
    if (isNew) {
      s = initStability(k);
      d = clamp(initDifficulty(k), 1, 10);
    } else {
      d = nextDifficulty(state.d, k);
      if (elapsed === 0) s = shortTermStability(state.s, k);
      else {
        const r = retrievability(elapsed, state.s);
        s = k === 1 ? forgetStability(state.d, state.s, r) : recallStability(state.d, state.s, r, k);
      }
    }
    s = clamp(s, S_MIN, S_MAX);
    return { s, d, ivl: interval(s) };
  });
  const [, hard, good, easy] = outcomes;
  hard.ivl = Math.min(hard.ivl, good.ivl);
  good.ivl = Math.max(good.ivl, hard.ivl + 1);
  easy.ivl = Math.max(easy.ivl, good.ivl + 1);

  const o = outcomes[g - 1];
  return {
    interval: o.ivl,
    state: {
      due: fromDay(toDay(date) + o.ivl),
      s: round4(o.s),
      d: round4(o.d),
      reps: (state.reps || 0) + 1,
      lapses: (state.lapses || 0) + (g === 1 && !isNew ? 1 : 0),
      last: date,
      state: g === 1 && !isNew ? 'relearning' : 'review',
    },
  };
}

module.exports = { W, RATINGS, schedule, retrievability, today, toDay, fromDay };

if (require.main === module) {
  const args = process.argv.slice(2);
  const di = args.indexOf('--date');
  const date = di >= 0 ? args.splice(di, 2)[1] : today();
  if (args.length < 2) { console.log('usage: node fsrs.js <state json> <rating> [--date YYYY-MM-DD]'); process.exit(2); }
  try {
    console.log(JSON.stringify(schedule(JSON.parse(args[0]), args[1], date)));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
