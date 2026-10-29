const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Runs skills/build/workflow.js against stub agent()/parallel()/pipeline() that
// mimic the Workflow tool: a dead agent is null, a throwing stage drops its item.
const SRC = fs.readFileSync(path.join(__dirname, '../../plugin/skills/build/workflow.js'), 'utf8')
  .replace(/^export const meta/m, 'const meta');
const AsyncFunction = (async () => {}).constructor;
const body = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', SRC);

async function run(args, reply) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, prompt, opts });
    const r = reply(opts.label, prompt);
    return r === undefined ? null : r;
  };
  const parallel = thunks => Promise.all(thunks.map(t => t().catch(() => null)));
  const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
    try {
      let r = item;
      for (const s of stages) r = await s(r, item, i);
      return r;
    } catch {
      return null;
    }
  }));
  const result = await body(args, agent, parallel, pipeline, () => {}, m => logs.push(m));
  return { result, calls, logs, labels: calls.map(c => c.label) };
}

const BASE = { plugin: '/p', course: '/c/demo', date: '2026-10-21' };
const SUMMARY = { totals: {}, topics: [], gaps: [] };
const ids = n => Array.from({ length: n }, (_, i) => `c${i + 1}`);
const cited = (n, source = 's1') => ids(n).map(id => ({ id, source }));

const fresh = (label, prompt) => {
  if (label.startsWith('collect:')) return { sources: ['s1'], thin: false, notes: '' };
  if (label.startsWith('write:')) return { claims: cited(8), exercises: ['e1', 'e2'], misconceptions: 1, notes: '' };
  if (label.endsWith(':exercises')) return { verdicts: [{ id: 'e1', verdict: 'verified', reason: '' }] };
  if (label.startsWith('verify:')) {
    const got = [...prompt.matchAll(/\^(c\d+)/g)].map(m => m[1]);
    return { verdicts: got.map(id => ({ id, verdict: id === 'c3' ? 'cut' : 'verified', reason: 'r' })) };
  }
  if (label.startsWith('apply:') || label.startsWith('rubric:')) return { ok: true, notes: '' };
  if (label === 'assemble') return SUMMARY;
};

const TOPICS = [
  { slug: 'limits', title: 'Limits', unit: 1 },
  { slug: 'derivatives', title: 'Derivatives', unit: 1 },
];
const UNITS = [{ n: 1, title: 'Basics', topics: ['limits', 'derivatives'] }];

test('rejects missing args', async () => {
  await assert.rejects(run({ mode: 'nope', ...BASE }, () => {}), /args need mode/);
  await assert.rejects(run({ mode: 'survey', ...BASE }, () => {}), /tag/);
});

test('survey: four sweeps then one plan', async () => {
  const plan = { units: [], out: [], backbone: [], traits: [], notes: '' };
  const { result, labels } = await run({ mode: 'survey', tag: 'base', ...BASE },
    l => (l === 'plan' ? plan : 'notes'));
  assert.deepStrictEqual(labels.sort(),
    ['plan', 'survey:curricula', 'survey:pitfalls', 'survey:structure', 'survey:texts']);
  assert.strictEqual(result.plan, plan);
});

test('survey: plan skips a dead sweep and says so', async () => {
  const { calls, logs } = await run({ mode: 'survey', tag: 'base', ...BASE },
    l => (l === 'survey:texts' ? undefined : l === 'plan' ? {} : 'notes'));
  assert.ok(!calls.find(c => c.label === 'plan').prompt.includes('texts.md'));
  assert.match(logs.join('\n'), /texts/);
});

test('produce: full run per topic, batched verification, tallies', async () => {
  const { result, labels } = await run({ mode: 'produce', topics: TOPICS, units: UNITS, ...BASE }, fresh);
  // per topic: 2 collect + write + 1 claim batch + exercises + apply; then rubric + assemble
  assert.strictEqual(labels.length, 2 * 6 + 2);
  assert.ok(labels.includes('verify:limits:1'));
  assert.deepStrictEqual(result.topics[0], {
    slug: 'limits', thin: false, claims: cited(8), exercises: ['e1', 'e2'],
    checked: 8, verified: 7, corrected: 0, cut: 1,
  });
  assert.deepStrictEqual(result.rubrics, [{ unit: 1, ok: true }]);
});

test('produce: resume skips finished stages and verifies the given claims', async () => {
  const { labels, calls } = await run({
    mode: 'produce', topics: TOPICS, units: [], ...BASE,
    done: {
      limits: ['collect-primary', 'collect-practice', 'write', 'verify'],
      derivatives: ['collect-primary', 'collect-practice', 'write'],
    },
    claims: { derivatives: ['c1', 'c2'] },
  }, fresh);
  assert.deepStrictEqual(labels.sort(),
    ['apply:derivatives', 'assemble', 'verify:derivatives:1', 'verify:derivatives:exercises']);
  assert.match(calls.find(c => c.label.endsWith(':exercises')).prompt, /every exercise/);
});

test('produce: a dead writer stops that topic and holds back its rubric', async () => {
  const { result, labels, logs } = await run({ mode: 'produce', topics: TOPICS, units: UNITS, ...BASE },
    (l, p) => (l === 'write:limits' ? undefined : fresh(l, p)));
  assert.strictEqual(result.topics[0].failed, 'write');
  assert.ok(!labels.some(l => l.startsWith('verify:limits') || l === 'apply:limits'));
  assert.ok(!labels.includes('rubric:unit-1'));
  assert.match(logs.join('\n'), /limits/);
});

test('produce: a dead verifier means no apply, so no marker', async () => {
  const { result, labels } = await run({ mode: 'produce', topics: TOPICS.slice(0, 1), units: [], ...BASE },
    (l, p) => (l === 'verify:limits:1' ? undefined : fresh(l, p)));
  assert.strictEqual(result.topics[0].failed, 'verify');
  assert.ok(!labels.includes('apply:limits'));
});

test('produce: claim batches keep each source whole and pack to 20', async () => {
  const claims = [
    ...cited(15, 'a'),
    ...cited(10, 'b').map(c => ({ ...c, id: c.id.replace('c', 'c1') })),
    ...cited(4, 'c').map(c => ({ ...c, id: c.id.replace('c', 'c2') })),
    ...cited(23, 'd').map(c => ({ ...c, id: c.id.replace('c', 'c3') })),
  ];
  const { calls } = await run({
    mode: 'produce', topics: TOPICS.slice(0, 1), units: [], ...BASE,
    done: { limits: ['collect-primary', 'collect-practice', 'write'] },
    claims: { limits: claims },
  }, fresh);
  const batches = calls.filter(c => /^verify:limits:\d+$/.test(c.label))
    .map(c => ({ n: [...c.prompt.matchAll(/\^c\d+/g)].length, cites: (c.prompt.match(/They cite (.*)\./) || [])[1] }));
  // d splits 20 + 3; then a 15 takes c 4; b 10 takes d's leftover 3
  assert.deepStrictEqual(batches, [
    { n: 20, cites: 'sources/d' },
    { n: 19, cites: 'sources/a, sources/c' },
    { n: 13, cites: 'sources/b, sources/d' },
  ]);
});

test('produce: bare claim ids still verify, without a cite line', async () => {
  const { calls } = await run({
    mode: 'produce', topics: TOPICS.slice(0, 1), units: [], ...BASE,
    done: { limits: ['collect-primary', 'collect-practice', 'write'] },
    claims: { limits: ids(3) },
  }, fresh);
  const v = calls.find(c => c.label === 'verify:limits:1');
  assert.strictEqual([...v.prompt.matchAll(/\^c\d+/g)].length, 3);
  assert.ok(!v.prompt.includes('They cite'));
});

test('produce: Opus writes and verifies; Sonnet collects, applies and assembles', async () => {
  const { calls } = await run({ mode: 'produce', topics: TOPICS.slice(0, 1), units: UNITS, ...BASE }, fresh);
  const model = label => calls.find(c => c.label === label).opts.model;
  assert.strictEqual(model('collect:limits:primary'), 'sonnet');
  assert.strictEqual(model('write:limits'), 'opus');
  assert.strictEqual(model('verify:limits:1'), 'opus');
  assert.strictEqual(model('verify:limits:exercises'), 'opus');
  assert.strictEqual(model('apply:limits'), 'sonnet');
  assert.strictEqual(model('rubric:unit-1'), 'sonnet');
  assert.strictEqual(model('assemble'), 'sonnet');
});

test('resolve: groups by topic; a cut fold becomes a rejection', async () => {
  const items = [
    { n: 3, line: '- … unverified a', kind: 'unverified', topic: 'limits', claim: 'a' },
    { n: 5, line: '- … dispute', kind: 'dispute', topic: 'limits', claim: 'limits^c2' },
    { n: 7, line: '- … unverified b', kind: 'unverified', topic: 'derivatives', claim: 'b' },
  ];
  const { result, labels } = await run({ mode: 'resolve', items, ...BASE }, (l, p) => {
    if (l === 'resolve:limits') {
      return { items: [{ n: 3, outcome: 'folded', id: 'c3', reason: '' }, { n: 5, outcome: 'rejected', reason: 'claim stands' }] };
    }
    if (l === 'resolve:derivatives') return undefined;
    return fresh(l, p);
  });
  assert.deepStrictEqual(labels.filter(l => l.startsWith('resolve:')).sort(), ['resolve:derivatives', 'resolve:limits']);
  const byN = Object.fromEntries(result.items.map(r => [r.n, r]));
  assert.strictEqual(byN[3].outcome, 'rejected');
  assert.match(byN[3].reason, /^cut in verification/);
  assert.strictEqual(byN[5].outcome, 'rejected');
  assert.strictEqual(byN[7].outcome, null);
  assert.ok(labels.includes('assemble'));
});
