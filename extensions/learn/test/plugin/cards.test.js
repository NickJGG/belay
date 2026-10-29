const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cards = require('../../plugin/scripts/cards');

const DECK = `# Cards

Some preamble the learner wrote.

### c-0001 · limits
Q: What is $\\lim_{x\\to 0} \\frac{\\sin x}{x}$?
A: $1$
<!-- fsrs {"due":"2026-01-01","s":0,"d":0,"reps":0,"lapses":0,"last":null,"state":"new"} -->

### c-0002 · derivatives
Q: Derivative of $x^2$?
A: $2x$, by the power rule.
   Holds for any real exponent.
<!-- fsrs {"due":"2026-02-01","s":12.5,"d":5.1,"reps":3,"lapses":0,"last":"2026-01-20","state":"review"} -->
`;

function course(text = DECK) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
  if (text !== null) fs.writeFileSync(path.join(dir, 'cards.md'), text);
  return dir;
}
const read = dir => fs.readFileSync(path.join(dir, 'cards.md'), 'utf8');

test('parse then serialize leaves the file unchanged', () => {
  for (const text of [DECK, DECK.replace(/\n/g, '\r\n'), DECK.trimEnd(), '# Cards\n']) {
    assert.strictEqual(cards.serialize(cards.parse(text)), text);
  }
});

test('parse reads ids, topics and multi-line answers', () => {
  const { cards: cs } = cards.parse(DECK);
  assert.deepStrictEqual(cs.map(c => [c.id, c.topic]), [['c-0001', 'limits'], ['c-0002', 'derivatives']]);
  assert.strictEqual(cs[1].a, '$2x$, by the power rule.\n   Holds for any real exponent.');
});

test('due lists cards on or before the date, flagging maths', () => {
  const dir = course();
  assert.deepStrictEqual(cards.due(dir, '2026-01-15').map(c => c.id), ['c-0001']);
  assert.deepStrictEqual(cards.due(dir, '2026-02-01').map(c => c.id), ['c-0001', 'c-0002']);
  assert.strictEqual(cards.due(dir, '2026-01-15')[0].math, true);
});

test('grade rewrites only that card\'s fsrs line', () => {
  const dir = course();
  const out = cards.grade(dir, 'c-0001', 'good', '2026-01-01');
  assert.strictEqual(out.due, '2026-01-03');
  const after = read(dir);
  assert.strictEqual(after.replace(/<!-- fsrs .*? -->/, ''), DECK.replace(/<!-- fsrs .*? -->/, ''));
  assert.match(after, /"reps":1,"lapses":0,"last":"2026-01-01","state":"review"/);
});

test('grade of an unknown id throws', () => {
  assert.throws(() => cards.grade(course(), 'c-9999', 'good', '2026-01-01'), /no card/);
});

test('add assigns the next ids and new fsrs state', () => {
  const dir = course();
  const input = path.join(dir, 'proposed.md');
  fs.writeFileSync(input, '### chain rule\nQ: d/dx f(g(x))?\nA: f\'(g(x)) g\'(x)\n\n### c-???? · limits\nQ: q\nA: a\n');
  assert.deepStrictEqual(cards.add(dir, input, '2026-03-01'), { added: ['c-0003', 'c-0004'] });
  const { cards: cs } = cards.parse(read(dir));
  assert.deepStrictEqual(cs.map(c => c.id), ['c-0001', 'c-0002', 'c-0003', 'c-0004']);
  assert.deepStrictEqual(cs[2].fsrs, { due: '2026-03-01', s: 0, d: 0, reps: 0, lapses: 0, last: null, state: 'new' });
  assert.strictEqual(cs[3].topic, 'limits');
  assert.ok(read(dir).startsWith(DECK));
});

test('add creates cards.md when missing', () => {
  const dir = course(null);
  const input = path.join(dir, 'proposed.md');
  fs.writeFileSync(input, '### t\nQ: q\nA: a\n');
  cards.add(dir, input, '2026-03-01');
  assert.match(read(dir), /^# Cards\n\n### c-0001 · t\nQ: q\nA: a\n<!-- fsrs /);
});

test('edit replaces only that card\'s Q and A', () => {
  const dir = course();
  const input = path.join(dir, 'edit.md');
  fs.writeFileSync(input, '### c-0002 · derivatives\nQ: Derivative of $x^3$?\nA: $3x^2$\n\n');
  assert.deepStrictEqual(cards.edit(dir, input), { edited: ['c-0002'] });
  const after = read(dir);
  assert.strictEqual(after, DECK.replace('Q: Derivative of $x^2$?\nA: $2x$, by the power rule.\n   Holds for any real exponent.', 'Q: Derivative of $x^3$?\nA: $3x^2$'));
});

test('edit keeps CRLF line endings', () => {
  const crlf = DECK.replace(/\n/g, '\r\n');
  const dir = course(crlf);
  const input = path.join(dir, 'edit.md');
  fs.writeFileSync(input, '### c-0001\nQ: q\nA: line one\nline two\n');
  cards.edit(dir, input);
  assert.strictEqual(read(dir), crlf.replace(/Q: What is .*?\r\nA: \$1\$/, 'Q: q\r\nA: line one\r\nline two'));
});

test('edit writes nothing when a block fails', () => {
  const dir = course();
  const input = path.join(dir, 'edit.md');
  for (const [text, err] of [
    ['### c-0001\nQ: q\nA: a\n\n### c-9999\nQ: q\nA: a\n', /no card c-9999/],
    ['### c-0001 · derivatives\nQ: q\nA: a\n', /is on limits/],
    ['### limits\nQ: q\nA: a\n', /needs a card id/],
    ['### c-0001\nQ: q\n', /Q: and A:/],
  ]) {
    fs.writeFileSync(input, text);
    assert.throws(() => cards.edit(dir, input), err);
    assert.strictEqual(read(dir), DECK);
  }
});

test('stats counts states and the next due date', () => {
  const s = cards.stats(course(), '2026-01-15');
  assert.deepStrictEqual(s, { total: 2, due: 1, overdue: 0, new: 1, review: 1, relearning: 0, reps: 3, lapses: 0, nextDue: '2026-02-01' });
});
