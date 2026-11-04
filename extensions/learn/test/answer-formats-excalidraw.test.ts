import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { focus } from '../answer-formats/excalidraw/focus.ts';
import { summarize } from '../answer-formats/excalidraw/summarize.ts';
import { layout, parseSpec, write } from '../answer-formats/excalidraw/write.ts';
import { formatFor, iconFor } from '../answer-formats/index.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'excalidraw');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.excalidraw`), 'utf8');
const body = (summary: string) => summary.split('\n').slice(1).join('\n');

test('formats are picked by extension, text by default', () => {
  assert.equal(formatFor('work/feed.excalidraw').id, 'excalidraw');
  assert.equal(formatFor('work/FEED.Excalidraw').id, 'excalidraw');
  assert.equal(formatFor('work/notes.md').id, 'text');
  assert.equal(iconFor('work/feed.excalidraw'), 'workflow');
  assert.equal(iconFor('work/notes.md'), 'file-text');
  assert.equal(iconFor('work/notes.txt'), 'file');
  assert.equal(iconFor('work/model.py'), 'file-code');
});

test('bound arrows: labels from containers or boundElements, arrowheads normalised, deleted elements dropped', () => {
  assert.equal(
    summarize(fixture('bound'), 'work/bound.excalidraw').text,
    `work/bound.excalidraw · 11 elements: 3 boxes, 4 arrows, 4 labels · all read
Boxes:
  API
  Cache (ellipse)
  DB (diamond)
Arrows:
  API → Cache "reads"
  API → Cache
  API ↔ DB
  API — DB`,
  );
});

test('unattached ends, free text and unreadable elements are reported with measurements', () => {
  const s = summarize(fixture('loose'), 'loose.excalidraw');
  assert.deepEqual(s.warnings, { unattached: 3, loose: 1, unreadable: 3 });
  assert.equal(
    body(s.text),
    `Boxes:
  Web
  Queue
Arrows:
  Web → ?  (end unattached; nearest box: Queue, 14px)
  ? → ?  (both ends unattached; nearest boxes: Web, 240px / Queue, 260px)
  Web → ?  (end unattached; nearest box: Web, 0px)
Notes:
  "retries 3x" (over Web)
  "scale later"
Unreadable:
  freedraw (nearest box: Queue, 40px)
  line (nearest box: Web, 50px)
  image (nearest box: Web, 440px)`,
  );
  assert.match(s.text.split('\n')[0], / · 3 unattached, 1 loose, 3 unreadable$/);
});

test('frames list their children; duplicate labels are numbered and unlabelled boxes counted', () => {
  assert.equal(
    body(summarize(fixture('frames'), 'f').text),
    `Boxes:
  Cache
  Cache #2
  box 1 (no label) (ellipse)
  box 2 (no label)
Arrows:
  Cache → Cache #2
Frames:
  Backend: Cache, Cache #2, Cache → Cache #2
  frame 2: (empty)`,
  );
});

test('every fixture is fully counted: the header parts sum to the element total', () => {
  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.excalidraw'))) {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    const live = (JSON.parse(text).elements as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted).length;
    const header = summarize(text, file).text.split('\n')[0];
    const [, total, parts] = /· (\d+) elements?: (.*?) ·/.exec(header)!;
    assert.equal(Number(total), live, file);
    assert.equal(
      parts.split(', ').reduce((s, p) => s + parseInt(p, 10), 0),
      live,
      file,
    );
  }
});

test('an empty scene and a file that is not a drawing', () => {
  assert.equal(summarize('{"type":"excalidraw","elements":[]}', 'e').text, 'e · 0 elements · all read');
  assert.throws(() => summarize('{"elements":[]}', 'x'), /not an Excalidraw file/);
  assert.throws(() => summarize('nope', 'x'), /not an Excalidraw file/);
});

test('focus: a box with its arrows, an arrow with its ends, a label for its container', () => {
  const text = fixture('bound');
  assert.deepEqual(focus(text, 'cache'), ['Cache (ellipse)', 'API → Cache "reads"', 'API → Cache']);
  assert.deepEqual(focus(text, 'cache-t'), focus(text, 'cache'));
  assert.deepEqual(focus(text, 'a3'), ['API ↔ DB', 'API', 'DB (diamond)']);
  assert.deepEqual(focus(text, 'a1-t'), ['API → Cache "reads"', 'API', 'Cache (ellipse)']);
  assert.deepEqual(focus(fixture('loose'), 'n1'), ['"retries 3x" (over Web)']);
  assert.deepEqual(focus(text, 'nope'), []);
});

const SPECS = {
  chain: `Boxes:
  Client
  LB
  API
  DB
Arrows:
  Client → LB
  LB → API "http"
  API → DB`,
  cycle: `Boxes:
  A
  B
  C
Arrows:
  A → B
  B → C
  C → A "retry"`,
  'fan-in': `Boxes:
  Web 1
  Web 2
  Web 3
  Queue (ellipse)
  Worker (diamond)
Arrows:
  Web 1 → Queue
  Web 2 → Queue
  Web 3 → Queue
  Queue ↔ Worker
  Worker — Web 1`,
  notes: `Boxes:
  API
  Cache
Arrows:
  API → Cache
  Cache → Cache "evict"
Notes:
  "TTL is 5 minutes"`,
};

for (const [name, spec] of Object.entries(SPECS)) {
  test(`round trip: summarize(write(spec)) is the spec (${name})`, () => {
    assert.equal(body(summarize(write(spec), 'x').text), spec);
  });
}

test('written files bind both sides of every arrow and carry the fields Excalidraw writes', () => {
  const file = JSON.parse(write(SPECS['fan-in']));
  assert.equal(file.type, 'excalidraw');
  assert.equal(file.source, 'belay');
  const byId = new Map(file.elements.map((e: { id: string }) => [e.id, e]));
  const indexes = file.elements.map((e: { index: string }) => e.index);
  assert.deepEqual([...indexes].sort(), indexes);
  for (const e of file.elements) {
    for (const k of ['id', 'seed', 'version', 'versionNonce', 'strokeColor', 'roughness', 'groupIds', 'updated', 'locked']) assert.ok(k in e, `${e.type} lacks ${k}`);
    if (e.type !== 'arrow') continue;
    for (const b of [e.startBinding, e.endBinding]) {
      const box = byId.get(b.elementId) as { boundElements: { id: string }[] };
      assert.ok(box.boundElements.some((x) => x.id === e.id));
    }
  }
});

test('layout: columns by longest path from a source, a cycle broken in first-seen order', () => {
  const cols = (spec: string) => Object.fromEntries([...layout(parseSpec(spec))].map(([n, p]) => [n, p.col]));
  assert.deepEqual(cols(SPECS.cycle), { A: 0, B: 1, C: 2 });
  assert.deepEqual(cols('A -> B\nB -> C\nA -> C'), { A: 0, B: 1, C: 2 });
  assert.deepEqual(cols(SPECS['fan-in']), { 'Web 1': 0, 'Web 2': 0, 'Web 3': 0, Queue: 1, Worker: 2 });
});

test('layout: one barycentre pass orders a column by its predecessors', () => {
  const pos = layout(parseSpec('Boxes:\n  A\n  B\n  Y\n  X\nArrows:\n  B -> Y\n  A -> X'));
  assert.equal(pos.get('X')!.row, 0);
  assert.equal(pos.get('Y')!.row, 1);
});

test('spec grammar: ascii arrows, reversed arrows, header ignored, bare lines, rejections', () => {
  const spec = parseSpec('x.excalidraw · 3 elements: 1 box · all read\nA -> B\nC <- B "back"\nA <-> C\nA -- C\nD (diamond)\nNotes:\n  "n" (over A)');
  assert.deepEqual(
    spec.boxes.map((b) => `${b.name}:${b.shape}`),
    ['A:rectangle', 'B:rectangle', 'C:rectangle', 'D:diamond'],
  );
  assert.deepEqual(spec.arrows, [
    { from: 'A', to: 'B', heads: 'end' },
    { from: 'B', to: 'C', heads: 'end', label: 'back' },
    { from: 'A', to: 'C', heads: 'both' },
    { from: 'A', to: 'C', heads: 'none' },
  ]);
  assert.deepEqual(spec.notes, ['n']);
  assert.throws(() => parseSpec('Arrows:\n  A -> ?'), /line 2: both ends/);
  assert.throws(() => parseSpec('Arrows:\n  just a box'), /line 2: expected an arrow/);
  assert.throws(() => parseSpec('Frames:\n  F: A'), /unknown section 'Frames:'/);
  assert.throws(() => parseSpec('\n\n'), /nothing to draw/);
});
