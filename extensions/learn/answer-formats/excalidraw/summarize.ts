/**
 * An Excalidraw drawing as exact text. Only what the file records by id is stated (arrow
 * bindings, text containers, arrowheads); anything else is reported with a measurement,
 * never guessed at: an unbound arrow end gets its nearest box, free text what it overlaps.
 */
import type { Summary } from '../types.ts';
import { arrowEnds, overlaps, parseScene, pointRect, rectDistance, rectOf, type Element, type Point, type Scene } from './scene.ts';

export const BOX_TYPES = ['rectangle', 'ellipse', 'diamond'];
const FRAME_TYPES = ['frame', 'magicframe'];

type Line = { id: string; line: string };
type ArrowLine = Line & { ends: (string | null)[] };

export type Analysis = {
  header: string;
  boxes: Line[];
  arrows: ArrowLine[];
  notes: Line[];
  frames: Line[];
  unreadable: Line[];
  /** A label's text element id → the box or arrow it labels. */
  labelOf: Map<string, string>;
  warnings: Summary['warnings'];
};

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const textOf = (e: Element) => clean(e.originalText ?? e.text);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function analyze(scene: Scene, name: string): Analysis {
  const { elements, byId } = scene;
  const isContainer = (id: string | null | undefined) => {
    const c = id ? byId.get(id) : undefined;
    return !!c && (BOX_TYPES.includes(c.type) || c.type === 'arrow');
  };
  const labelOf = new Map<string, string>();
  for (const e of elements) if (e.type === 'text' && isContainer(e.containerId)) labelOf.set(e.id, e.containerId!);
  for (const c of elements) {
    if (!isContainer(c.id)) continue;
    for (const b of c.boundElements ?? []) {
      const t = byId.get(b.id);
      if (t?.type === 'text' && !labelOf.has(t.id) && !t.containerId) labelOf.set(t.id, c.id);
    }
  }
  const labelText = new Map<string, string>();
  for (const [textId, containerId] of labelOf) {
    const t = textOf(byId.get(textId)!);
    if (t) labelText.set(containerId, labelText.has(containerId) ? `${labelText.get(containerId)} ${t}` : t);
  }

  const boxEls = elements.filter((e) => BOX_TYPES.includes(e.type));
  const names = new Map<string, string>();
  const seen = new Map<string, number>();
  let unlabelled = 0;
  for (const b of boxEls) {
    const label = labelText.get(b.id);
    if (!label) {
      names.set(b.id, `box ${++unlabelled} (no label)`);
      continue;
    }
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    names.set(b.id, n === 1 ? label : `${label} #${n}`);
  }
  const boxes = boxEls.map((b) => ({ id: b.id, line: b.type === 'rectangle' ? names.get(b.id)! : `${names.get(b.id)} (${b.type})` }));

  const nearest = (p: Point) => {
    let best: { name: string; d: number } | null = null;
    for (const b of boxEls) {
      const d = rectDistance(pointRect(p), rectOf(b));
      if (!best || d < best.d) best = { name: names.get(b.id)!, d };
    }
    return best ? `${best.name}, ${Math.round(best.d)}px` : 'none';
  };
  const nearestTo = (e: Element) => {
    let best: { name: string; d: number } | null = null;
    for (const b of boxEls) {
      const d = rectDistance(rectOf(e), rectOf(b));
      if (!best || d < best.d) best = { name: names.get(b.id)!, d };
    }
    return best ? `${best.name}, ${Math.round(best.d)}px` : 'none';
  };
  const freeText = (e: Element) => `"${textOf(e)}"`;
  const endName = (id: string) => {
    const e = byId.get(id)!;
    if (names.has(id)) return names.get(id)!;
    if (e.type === 'text') return freeText(e);
    return e.type;
  };

  let unattached = 0;
  const arrows: ArrowLine[] = elements
    .filter((e) => e.type === 'arrow')
    .map((a) => {
      const bound = (b: Element['startBinding']) => (b?.elementId && byId.has(b.elementId) ? b.elementId : null);
      const [p1, p2] = arrowEnds(a);
      let left = { id: bound(a.startBinding), p: p1 };
      let right = { id: bound(a.endBinding), p: p2 };
      const head1 = !!a.startArrowhead;
      const head2 = !!a.endArrowhead;
      if (head1 && !head2) [left, right] = [right, left];
      const op = head1 && head2 ? '↔' : head1 || head2 ? '→' : '—';
      const label = labelText.get(a.id);
      let line = `${left.id ? endName(left.id) : '?'} ${op} ${right.id ? endName(right.id) : '?'}${label ? ` "${label}"` : ''}`;
      if (!left.id && !right.id) line += `  (both ends unattached; nearest boxes: ${nearest(left.p)} / ${nearest(right.p)})`;
      else if (!left.id) line += `  (start unattached; nearest box: ${nearest(left.p)})`;
      else if (!right.id) line += `  (end unattached; nearest box: ${nearest(right.p)})`;
      if (!left.id || !right.id) unattached++;
      return { id: a.id, line, ends: [left.id, right.id] };
    });

  let loose = 0;
  const noteEls = elements.filter((e) => e.type === 'text' && !labelOf.has(e.id));
  const notes = noteEls.map((n) => {
    const over = boxEls.filter((b) => overlaps(rectOf(n), rectOf(b))).map((b) => names.get(b.id)!);
    if (!over.length) loose++;
    return { id: n.id, line: over.length ? `${freeText(n)} (over ${over.join(', ')})` : freeText(n) };
  });

  const frameEls = elements.filter((e) => FRAME_TYPES.includes(e.type));
  const frames = frameEls.map((f, i) => {
    const children = elements.filter((e) => e.frameId === f.id && !labelOf.has(e.id));
    const childNames = children.map((c) => (c.type === 'arrow' ? arrows.find((a) => a.id === c.id)!.line.split('  (')[0] : endName(c.id)));
    return { id: f.id, line: `${clean(f.name ?? '') || `frame ${i + 1}`}: ${childNames.join(', ') || '(empty)'}` };
  });

  const known = new Set(['arrow', 'text', ...BOX_TYPES, ...FRAME_TYPES]);
  const unreadable = elements.filter((e) => !known.has(e.type)).map((e) => ({ id: e.id, line: `${e.type} (nearest box: ${nearestTo(e)})` }));

  const counts: [number, string, string?][] = [
    [boxes.length, 'box', 'boxes'],
    [arrows.length, 'arrow'],
    [labelOf.size, 'label'],
    [notes.length, 'note'],
    [frames.length, 'frame'],
    [unreadable.length, 'unreadable', 'unreadable'],
  ];
  const total = counts.reduce((s, [n]) => s + n, 0);
  if (total !== elements.length) throw new Error(`summary counted ${total} of ${elements.length} elements`);

  const warnings = { unattached, loose, unreadable: unreadable.length };
  const problems = [
    warnings.unattached && `${warnings.unattached} unattached`,
    warnings.loose && `${warnings.loose} loose`,
    warnings.unreadable && `${warnings.unreadable} unreadable`,
  ].filter(Boolean);
  const parts = counts.filter(([n]) => n).map(([n, one, many]) => plural(n, one, many));
  const header = `${name} · ${plural(elements.length, 'element')}${parts.length ? `: ${parts.join(', ')}` : ''} · ${problems.length ? problems.join(', ') : 'all read'}`;
  return { header, boxes, arrows, notes, frames, unreadable, labelOf, warnings };
}

export function summarize(text: string, name: string): Summary {
  const a = analyze(parseScene(text), name);
  const sections: [string, Line[]][] = [
    ['Boxes', a.boxes],
    ['Arrows', a.arrows],
    ['Notes', a.notes],
    ['Frames', a.frames],
    ['Unreadable', a.unreadable],
  ];
  const body = sections.filter(([, ls]) => ls.length).flatMap(([h, ls]) => [`${h}:`, ...ls.map((l) => `  ${l.line}`)]);
  return { text: [a.header, ...body].join('\n'), warnings: a.warnings };
}
