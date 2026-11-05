const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const courses = require('../../plugin/scripts/courses');

const COURSE = `---
goal: "Apply the chain rule # to composites"
level: "High-school algebra"
traits: [notation, code]        # any of: notation | code | language | reading
backbone: "[[sources/stewart-ch3]]"
scope:
  in: [limits, derivatives]
  out: [multivariable]
build: accepted
created: 2026-10-21
---

Notes.
`;

const SYLLABUS = `# Syllabus

## Unit 1 · Limits
- [x] limit-definition · done
- [x] limit-laws · done
- checkpoint 1 · pass 2026-10-01 85%

## Unit 2 · Derivatives
- [x] derivative-definition · done
- [ ] chain-rule · in-progress
- [ ] implicit · todo
- checkpoint 2 · pending
`;

const LOG = `## 2026-10-10 · full
- topics: limit-laws

## 2026-10-12 · quick
- cards: 3 reviewed (1 again)
`;

const CARDS = `# Cards

### c-0001 · limits
Q: q
A: a
<!-- fsrs {"due":"2026-10-20","s":3,"d":5,"reps":2,"lapses":0,"last":"2026-10-17","state":"review"} -->
`;

function make(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-root-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, name));
    for (const [f, text] of Object.entries(content)) fs.writeFileSync(path.join(root, name, f), text);
  }
  return root;
}

test('frontmatter reads scalars, lists, nesting, and keeps quoted #', () => {
  const fm = courses.frontmatter(COURSE);
  assert.strictEqual(fm.goal, 'Apply the chain rule # to composites');
  assert.deepStrictEqual(fm.traits, ['notation', 'code']);
  assert.deepStrictEqual(fm.scope, { in: ['limits', 'derivatives'], out: ['multivariable'] });
  assert.strictEqual(fm.build, 'accepted');
  assert.strictEqual(fm.backbone, '[[sources/stewart-ch3]]');
});

test('overview finds the next topic, last session and open checkpoint', () => {
  const root = make({ calc: { 'course.md': COURSE, 'syllabus.md': SYLLABUS, 'log.md': LOG, 'cards.md': CARDS } });
  const o = courses.overview(path.join(root, 'calc'), '2026-10-21');
  assert.strictEqual(o.course, 'calc');
  assert.deepStrictEqual(o.topics, { done: 3, total: 5 });
  assert.deepStrictEqual(o.next, { topic: 'chain-rule', status: 'in-progress', unit: 2 });
  assert.deepStrictEqual(o.last, { date: '2026-10-12', kind: 'quick' });
  assert.deepStrictEqual(o.checkpoint, { unit: 2, title: 'Derivatives', result: 'pending', left: ['chain-rule', 'implicit'], due: false });
  assert.strictEqual(o.cards.due, 1);
});

test('a unit with every topic done has its checkpoint due', () => {
  const syl = SYLLABUS.replace('checkpoint 1 · pass 2026-10-01 85%', 'checkpoint 1 · partial 2026-10-01 70%');
  const root = make({ calc: { 'course.md': COURSE, 'syllabus.md': syl } });
  const o = courses.overview(path.join(root, 'calc'), '2026-10-21');
  assert.deepStrictEqual(o.checkpoint, { unit: 1, title: 'Limits', result: 'partial', left: [], due: true });
  assert.strictEqual(o.last, null);
  assert.strictEqual(o.cards.total, 0);
});

test('all lists only folders with a course.md', () => {
  const root = make({ calc: { 'course.md': COURSE }, '.obsidian': { 'app.json': '{}' }, notes: { 'x.md': '' } });
  const prev = process.env.LEARNING_ROOT;
  process.env.LEARNING_ROOT = root;
  try {
    const list = courses.all('2026-10-21');
    assert.deepStrictEqual(list.map(c => c.course), ['calc']);
    assert.strictEqual(list[0].next, null);
    assert.strictEqual(list[0].checkpoint, null);
  } finally {
    if (prev === undefined) delete process.env.LEARNING_ROOT;
    else process.env.LEARNING_ROOT = prev;
  }
});

test('only ready units give the next topic and checkpoint', () => {
  const course = COURSE.replace('build: accepted', 'build: written\nready: [1]');
  const syl = SYLLABUS.replace('checkpoint 1 · pass 2026-10-01 85%', 'checkpoint 1 · pending');
  const root = make({ calc: { 'course.md': course, 'syllabus.md': syl } });
  const o = courses.overview(path.join(root, 'calc'), '2026-10-21');
  assert.deepStrictEqual(o.ready, [1]);
  assert.deepStrictEqual(o.unbuilt, [2]);
  assert.deepStrictEqual(o.topics, { done: 2, total: 2 });
  assert.strictEqual(o.next, null);
  assert.deepStrictEqual(o.checkpoint, { unit: 1, title: 'Limits', result: 'pending', left: [], due: true });
});

test('an accepted course without ready has every unit ready; an unaccepted one none', () => {
  const root = make({
    old: { 'course.md': COURSE, 'syllabus.md': SYLLABUS },
    fresh: { 'course.md': COURSE.replace('build: accepted', 'build: written'), 'syllabus.md': SYLLABUS },
  });
  const old = courses.overview(path.join(root, 'old'), '2026-10-21');
  assert.deepStrictEqual([old.ready, old.unbuilt], [[1, 2], []]);
  const fresh = courses.overview(path.join(root, 'fresh'), '2026-10-21');
  assert.deepStrictEqual([fresh.ready, fresh.unbuilt, fresh.next], [[], [1, 2], null]);
});

test('a failed checkpoint that reopens topics puts them next, ahead of later units', () => {
  const syl = SYLLABUS
    .replace('- [x] limit-laws · done', '- [ ] limit-laws · in-progress')
    .replace('checkpoint 1 · pass 2026-10-01 85%', 'checkpoint 1 · fail 2026-10-20 42%');
  const root = make({ calc: { 'course.md': COURSE, 'syllabus.md': syl } });
  const o = courses.overview(path.join(root, 'calc'), '2026-10-21');
  assert.deepStrictEqual(o.next, { topic: 'limit-laws', status: 'in-progress', unit: 1 });
  assert.deepStrictEqual(o.checkpoint, { unit: 1, title: 'Limits', result: 'fail', left: ['limit-laws'], due: false });
});

test('the next topic stays in the unit last worked on, past an earlier unit left in progress, then moves on from it', () => {
  const syl = `# Syllabus

## Unit 1 · Limits
- [ ] limit-definition · in-progress
- checkpoint 1 · pending

## Unit 2 · Derivatives
- [x] derivative-definition · done
- [ ] chain-rule · todo
- checkpoint 2 · pending

## Unit 3 · Integrals
- [ ] antiderivatives · todo
- checkpoint 3 · pending
`;
  const log = '## 2026-10-11 · full\n- topics: derivative-definition\n\n## 2026-10-12 · review\n- cards: 3 reviewed (1 again)\n';
  const next = (s, l) => {
    const root = make({ calc: { 'course.md': COURSE, 'syllabus.md': s, 'log.md': l } });
    return courses.overview(path.join(root, 'calc'), '2026-10-21').next;
  };
  assert.deepStrictEqual(next(syl, log), { topic: 'chain-rule', status: 'todo', unit: 2 });
  const unit2Done = syl.replace('- [ ] chain-rule · todo', '- [x] chain-rule · done');
  assert.deepStrictEqual(next(unit2Done, log), { topic: 'antiderivatives', status: 'todo', unit: 3 });
  assert.deepStrictEqual(next(syl, ''), { topic: 'limit-definition', status: 'in-progress', unit: 1 });
  const failed = `${log}\n## 2026-10-13 · checkpoint\n- topics: limit-definition\n- checkpoint: unit 1 · fail 40%\n`;
  assert.deepStrictEqual(next(syl, failed), { topic: 'limit-definition', status: 'in-progress', unit: 1 });
});

const READ_SYLLABUS = `# Syllabus

## Unit 1 · Method
- [x] read · tan-ch2 · done · Tan ch. 2 · 2.1 Clarify requirements; 2.2 Draft the API
- [ ] read · ddia-ch2 · todo · DDIA ch. 2 · Describing Performance
- [ ] framework · in-progress
- [ ] estimation · todo
- checkpoint 1 · pending

## Unit 2 · Designs
- [ ] chat · todo
- [ ] read · ddia-ch2 · todo · DDIA ch. 2 · Reliability and Fault Tolerance
- checkpoint 2 · pending
`;

const READ_COURSE = COURSE.replace('build: accepted', 'build: accepted\nreading: start\nread-after: [2]');

function withRoot(root, fn) {
  const prev = process.env.LEARNING_ROOT;
  process.env.LEARNING_ROOT = root;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.LEARNING_ROOT;
    else process.env.LEARNING_ROOT = prev;
  }
}

test('reading lines parse in sequence with topics and the checkpoint', () => {
  const [u1, u2] = courses.syllabus(READ_SYLLABUS);
  assert.deepStrictEqual(u1.reading, [
    { source: 'tan-ch2', status: 'done', label: 'Tan ch. 2', sections: ['2.1 Clarify requirements', '2.2 Draft the API'] },
    { source: 'ddia-ch2', status: 'todo', label: 'DDIA ch. 2', sections: ['Describing Performance'] },
  ]);
  assert.deepStrictEqual(u1.topics.map(t => t.topic), ['framework', 'estimation']);
  assert.deepStrictEqual(u1.items.map(i => i.kind), ['read', 'read', 'topic', 'topic', 'checkpoint']);
  assert.deepStrictEqual(u2.items.map(i => i.source || i.topic || i.kind), ['chat', 'ddia-ch2', 'checkpoint']);
});

test('overview gives the unread reading before the next topic, units and titles', () => {
  const root = make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': READ_SYLLABUS } });
  const o = courses.overview(path.join(root, 'sd'), '2026-10-21');
  assert.deepStrictEqual(o.next.reading, { source: 'ddia-ch2', status: 'todo', label: 'DDIA ch. 2', sections: ['Describing Performance'] });
  assert.deepStrictEqual(o.units.map(u => u.reading.length), [2, 1]);
  assert.strictEqual(o.titles.framework, 'Framework');
});

test('reading after the next topic is not next', () => {
  const syl = READ_SYLLABUS.replace(/- \[[ x]\] (framework|estimation) · \S+/g, '- [x] $1 · done');
  const root = make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': syl } });
  const o = courses.overview(path.join(root, 'sd'), '2026-10-21');
  assert.strictEqual(o.next.topic, 'chat');
  assert.strictEqual(o.next.reading, undefined);
  assert.strictEqual(o.checkpoint.reading, undefined);
});

test("a read-after unit's reading rides on its checkpoint once the topics are done", () => {
  const syl = READ_SYLLABUS.replace(/- \[[ x]\] (framework|estimation|chat) · \S+/g, '- [x] $1 · done').replace('checkpoint 1 · pending', 'checkpoint 1 · pass 2026-10-20 90%');
  const root = make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': syl } });
  const o = courses.overview(path.join(root, 'sd'), '2026-10-21');
  assert.strictEqual(o.next, null);
  assert.strictEqual(o.checkpoint.unit, 2);
  assert.strictEqual(o.checkpoint.reading.source, 'ddia-ch2');
});

test('read marks one source in every unit, and undo restores the bytes', () => {
  const root = make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': READ_SYLLABUS } });
  const file = path.join(root, 'sd', 'syllabus.md');
  withRoot(root, () => {
    assert.deepStrictEqual(courses.read('sd', 'ddia-ch2'), { source: 'ddia-ch2', units: [1, 2], status: 'done' });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), READ_SYLLABUS
      .replace('- [ ] read · ddia-ch2 · todo · DDIA ch. 2 · Describing', '- [x] read · ddia-ch2 · done · DDIA ch. 2 · Describing')
      .replace('- [ ] read · ddia-ch2 · todo · DDIA ch. 2 · Reliability', '- [x] read · ddia-ch2 · done · DDIA ch. 2 · Reliability'));
    assert.strictEqual(courses.read('sd', 'ddia-ch2', true).status, 'todo');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), READ_SYLLABUS);
    assert.throws(() => courses.read('sd', 'nope-ch9'), /no reading line for nope-ch9/);
  });
});

test('read keeps CRLF line endings', () => {
  const crlf = READ_SYLLABUS.replace(/\n/g, '\r\n');
  const root = make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': crlf } });
  const file = path.join(root, 'sd', 'syllabus.md');
  withRoot(root, () => {
    courses.read('sd', 'tan-ch2', true);
    const after = fs.readFileSync(file, 'utf8');
    assert.strictEqual(after, crlf.replace('- [x] read · tan-ch2 · done', '- [ ] read · tan-ch2 · todo'));
    assert.strictEqual(courses.syllabus(after)[0].reading[0].status, 'todo');
  });
});

const NEW_LOG = `# Log

## 2026-10-26 · full
- topics: framework
- cards: 0 reviewed (0 again)
- skipped: diagnostic, teach — stopped at step 3 to finish the unit reading

## 2026-10-26 · full
- topics: framework, estimation
- quiz: 2/5

## 2026-10-27 · full · 14:05
- topics: framework
- cards: 4 reviewed (1 again)
- cards added: 3
- quiz: 4/5
- ended: complete

## 2026-10-28 · quick · 09:30
- skipped: quiz
- ended: early
`;

test('sessions parse old and new log entries', () => {
  const s = courses.parseLog(NEW_LOG);
  assert.deepStrictEqual(s[0], { date: '2026-10-26', time: null, kind: 'full', topics: ['framework'], quiz: null, cardsReviewed: 0, cardsAdded: null, ended: 'early' });
  assert.deepStrictEqual([s[1].topics, s[1].quiz, s[1].ended], [['framework', 'estimation'], '2/5', 'complete']);
  assert.deepStrictEqual(s[2], { date: '2026-10-27', time: '14:05', kind: 'full', topics: ['framework'], quiz: '4/5', cardsReviewed: 4, cardsAdded: 3, ended: 'complete' });
  assert.deepStrictEqual([s[3].time, s[3].kind, s[3].ended], ['09:30', 'quick', 'early']);
  assert.deepStrictEqual(courses.lastSession(NEW_LOG), { date: '2026-10-28', kind: 'quick' });
  const root = make({ sd: { 'log.md': NEW_LOG.replace(/\n/g, '\r\n') } });
  assert.deepStrictEqual(courses.sessions(path.join(root, 'sd')), s);
});

test('titles come from knowledge headings, falling back to a tidied slug', () => {
  const root = make({
    sd: { 'course.md': READ_COURSE, 'syllabus.md': READ_SYLLABUS },
    x: { 'syllabus.md': '## Unit 1 · A\n- [ ] partition-keys · todo\n' },
  });
  fs.mkdirSync(path.join(root, 'sd', 'knowledge'));
  fs.writeFileSync(path.join(root, 'sd', 'knowledge', 'framework.md'), '# The 45-minute interview framework\r\n\r\nClaim. ^c1\r\n');
  assert.deepStrictEqual(courses.titles(path.join(root, 'sd')), {
    framework: 'The 45-minute interview framework',
    estimation: 'Estimation',
    chat: 'Chat',
  });
  assert.deepStrictEqual(courses.titles(path.join(root, 'x')), { 'partition-keys': 'Partition keys' });
});

const EXERCISES = `# Framework exercises

## e1 · recall
Q.

## e2 · apply
Q.
`;

test('progress reads exercise parts and the last quiz on the topic', () => {
  const dir = path.join(make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': READ_SYLLABUS, 'log.md': NEW_LOG } }), 'sd');
  fs.mkdirSync(path.join(dir, 'exercises'));
  fs.mkdirSync(path.join(dir, 'lessons'));
  fs.writeFileSync(path.join(dir, 'exercises', 'framework.md'), EXERCISES);
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-26-framework.md'), '## Exercises\n- e1 · alone\n- e2 · hint, partial, shown — needed the API step\n');
  assert.deepStrictEqual(courses.progress(dir, 'framework'), {
    practised: false, lastQuiz: '4/5', quizOk: true, exercises: [{ n: 2, kind: 'apply', steps: 1, parts: ['hint', 'partial', 'shown'] }],
  });
  assert.deepStrictEqual(courses.progress(dir, 'estimation'), { practised: false, lastQuiz: '2/5', quizOk: false, exercises: [] });
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-checkpoint-1.md'), '- e2 · alone\n');
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-other-framework.md'), '- e2 · alone\n');
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-other-framework-2.md'), '- e2 · alone\n');
  assert.strictEqual(courses.progress(dir, 'framework').practised, false);
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-framework.md'), '## Exercises\r\n- e2 · nudge, hint, shown — one answer given\r\n');
  assert.strictEqual(courses.progress(dir, 'framework').practised, true);
  assert.deepStrictEqual(courses.progress(dir, 'chat'), { practised: false, lastQuiz: null, quizOk: false, exercises: [] });
});

test('progress counts an exercise at half its parts not given away; partial and shown count against', () => {
  const dir = path.join(make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': READ_SYLLABUS, 'log.md': NEW_LOG } }), 'sd');
  fs.mkdirSync(path.join(dir, 'exercises'));
  fs.mkdirSync(path.join(dir, 'lessons'));
  fs.writeFileSync(path.join(dir, 'exercises', 'framework.md'), EXERCISES);
  const note = path.join(dir, 'lessons', '2026-10-26-framework.md');
  const practised = line => (fs.writeFileSync(note, `${line}\n`), courses.progress(dir, 'framework').practised);
  assert.strictEqual(practised('- e2 · hint, hint, partial, shown'), true);
  assert.strictEqual(practised('- e2 · alone, partial, shown'), false);
  assert.strictEqual(practised('- e2 · shown'), false);
  assert.strictEqual(practised('- e2 · hint'), true);
  assert.strictEqual(practised('- e1 · alone, alone'), false);
});

test('progress keeps each exercise\'s best attempt, reading same-day second notes, and counts solution steps', () => {
  const dir = path.join(make({ sd: { 'course.md': READ_COURSE, 'syllabus.md': READ_SYLLABUS, 'log.md': NEW_LOG } }), 'sd');
  fs.mkdirSync(path.join(dir, 'exercises'));
  fs.mkdirSync(path.join(dir, 'lessons'));
  fs.writeFileSync(path.join(dir, 'exercises', 'framework.md'),
    '## e10 · transfer\nQ.\n\n## e1 · recall\nQ.\n\n## e3 · apply\n1. Not a step.\n<details>\n\n1. First\n   1. nested\n2. Second\n</details>\n\n## e4 · analyse\nQ.\n\n## e5 · apply\nQ.\n');
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-26-framework.md'), '- e3 · shown, shown\n- e4 · hint, hint\n- e1 · alone\n');
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-framework.md'), '- e3 · hint, partial\n- e4 · partial, shown\n');
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-framework-2.md'), '- e3 · alone, shown\n- e5 · partial, partial\n');
  assert.deepStrictEqual(courses.progress(dir, 'framework').exercises, [
    { n: 3, kind: 'apply', steps: 2, parts: ['alone', 'shown'] },
    { n: 4, kind: 'analyse', steps: 1, parts: ['hint', 'hint'] },
    { n: 5, kind: 'apply', steps: 1, parts: ['partial', 'partial'] },
    { n: 10, kind: 'transfer', steps: 1, parts: null },
  ]);
  assert.strictEqual(courses.progress(dir, 'framework').practised, true);
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-26-framework.md'), '- e1 · alone\n');
  assert.strictEqual(courses.progress(dir, 'framework').practised, true);
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-framework.md'), '');
  fs.writeFileSync(path.join(dir, 'lessons', '2026-10-27-framework-2.md'), '- e3 · old line, with hints\n- e3 · with hints\n');
  assert.strictEqual(courses.progress(dir, 'framework').practised, false);
});
