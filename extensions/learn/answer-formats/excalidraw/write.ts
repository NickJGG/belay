/**
 * An Excalidraw file from a spec in the summary's grammar:
 *
 *   Boxes:              (optional; boxes named only in arrows are rectangles)
 *     Cache (ellipse)   (shape suffix: ellipse or diamond)
 *   Arrows:
 *     API -> Cache "reads"     (->/→, <->/↔, <-/←, --/—; the quoted label is optional)
 *   Notes:              (optional; placed under the diagram)
 *     "TTL is 5 minutes"
 *
 * Layout: a box's column is its longest arrow distance from a box with no incoming arrows
 * (cycles broken in first-seen order); rows keep first-seen order, then one barycentre pass.
 */

type Shape = 'rectangle' | 'ellipse' | 'diamond';
type Box = { name: string; shape: Shape };
type Arrow = { from: string; to: string; heads: 'end' | 'both' | 'none'; label?: string };
export type Spec = { boxes: Box[]; arrows: Arrow[]; notes: string[] };

const SECTIONS = ['Boxes', 'Arrows', 'Notes'];
const ARROW = /^(.+?)\s+(<->|↔|->|→|<-|←|--|—)\s+(.+?)(?:\s+"(.*)")?$/;
const BOX = /^(.+?)(?:\s+\((rectangle|ellipse|diamond)\))?$/;

export function parseSpec(spec: string): Spec {
  const boxes = new Map<string, Box>();
  const arrows: Arrow[] = [];
  const notes: string[] = [];
  const box = (name: string, shape: Shape = 'rectangle') => {
    if (!boxes.has(name)) boxes.set(name, { name, shape });
  };
  let section: string | null = null;
  let first = true;
  for (const [i, raw] of spec.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const at = `line ${i + 1}`;
    if (first && / · \d+ elements?\b/.test(line)) {
      first = false;
      continue;
    }
    first = false;
    const heading = /^([A-Z][A-Za-z ]*):$/.exec(line);
    if (heading && (SECTIONS.includes(heading[1]) || !raw.startsWith(' '))) {
      if (!SECTIONS.includes(heading[1])) throw new Error(`${at}: unknown section '${heading[1]}:' (use Boxes:, Arrows: or Notes:)`);
      section = heading[1];
      continue;
    }
    if (section === 'Notes') {
      notes.push(/^"(.*)"/.exec(line)?.[1] ?? line);
      continue;
    }
    const arrow = ARROW.exec(line);
    if (section === 'Arrows' || (!section && arrow)) {
      if (!arrow) throw new Error(`${at}: expected an arrow like 'A -> B "label"', got '${line}'`);
      let [, from, op, to, label] = arrow;
      if (from === '?' || to === '?') throw new Error(`${at}: both ends of an arrow must be boxes, not '?'`);
      if (op === '<-' || op === '←') [from, to] = [to, from];
      const heads = op === '<->' || op === '↔' ? 'both' : op === '--' || op === '—' ? 'none' : 'end';
      box(from);
      box(to);
      arrows.push({ from, to, heads, ...(label ? { label } : {}) });
      continue;
    }
    const [, name, shape] = BOX.exec(line)!;
    box(name, (shape as Shape | undefined) ?? 'rectangle');
  }
  if (!boxes.size) throw new Error('nothing to draw: the spec names no boxes');
  return { boxes: [...boxes.values()], arrows, notes };
}

/** Tarjan's strongly connected components: each box → its component's number. */
function components(nodes: string[], edges: Arrow[]): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const comp = new Map<string, number>();
  const stack: string[] = [];
  let next = 0;
  let count = 0;
  const visit = (n: string) => {
    index.set(n, next);
    low.set(n, next++);
    stack.push(n);
    for (const { to } of edges.filter((e) => e.from === n)) {
      if (!index.has(to)) {
        visit(to);
        low.set(n, Math.min(low.get(n)!, low.get(to)!));
      } else if (!comp.has(to)) low.set(n, Math.min(low.get(n)!, index.get(to)!));
    }
    if (low.get(n) !== index.get(n)) return;
    let m: string;
    do {
      m = stack.pop()!;
      comp.set(m, count);
    } while (m !== n);
    count++;
  };
  for (const n of nodes) if (!index.has(n)) visit(n);
  return comp;
}

/** Column and row of each box. Within a cycle, arrows back to an earlier-seen box don't push columns. */
export function layout(spec: Spec): Map<string, { col: number; row: number }> {
  const order = spec.boxes.map((b) => b.name);
  const edges = spec.arrows.filter((a) => a.from !== a.to);
  const seen = new Map(order.map((n, i) => [n, i]));
  const scc = components(order, edges);
  const dag = edges.filter((e) => scc.get(e.from) !== scc.get(e.to) || seen.get(e.from)! < seen.get(e.to)!);

  const col = new Map(order.map((n) => [n, 0]));
  const indeg = new Map(order.map((n) => [n, 0]));
  for (const e of dag) indeg.set(e.to, indeg.get(e.to)! + 1);
  const queue = order.filter((n) => indeg.get(n) === 0);
  while (queue.length) {
    const n = queue.shift()!;
    for (const e of dag.filter((e) => e.from === n)) {
      col.set(e.to, Math.max(col.get(e.to)!, col.get(n)! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }

  const cols: string[][] = [];
  for (const n of order) (cols[col.get(n)!] ??= []).push(n);
  const row = new Map<string, number>();
  cols.forEach((names, c) => {
    if (c > 0) {
      const bary = new Map(
        names.map((n, i) => {
          const preds = dag.filter((e) => e.to === n && col.get(e.from)! < c).map((e) => row.get(e.from)!);
          return [n, preds.length ? preds.reduce((s, r) => s + r, 0) / preds.length : i];
        }),
      );
      names.sort((a, b) => bary.get(a)! - bary.get(b)!);
    }
    names.forEach((n, i) => row.set(n, i));
  });
  return new Map(order.map((n) => [n, { col: col.get(n)!, row: row.get(n)! }]));
}

const BOX_W = 160;
const BOX_H = 60;
const COL_GAP = 60;
const ROW_GAP = 60;
const FONT = 20;
const LABEL_FONT = 16;
/** Arrow line left showing on each side of its label, which Excalidraw centres on the arrow and masks the line behind. */
const LABEL_MARGIN_X = 40;
const LABEL_MARGIN_Y = 30;
const LOOP_INSET = 20;
const LINE_H = 1.25;
const GAP = 5;

const textSize = (s: string, size = FONT) => ({
  width: Math.ceil(Math.max(...s.split('\n').map((l) => l.length)) * size * 0.6),
  height: Math.ceil(s.split('\n').length * size * LINE_H),
});

const rand = () => Math.floor(Math.random() * 2 ** 31);
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const newId = () => Array.from({ length: 21 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Excalidraw's fractional `index`, ascending in array order. */
const fractionalIndex = (i: number) => (i < 62 ? `a${BASE62[i]}` : `b${BASE62[Math.floor(i / 62) - 1]}${BASE62[i % 62]}`);

type Json = Record<string, unknown>;

function base(type: string, x: number, y: number, width: number, height: number, roundness: Json | null): Json {
  return {
    id: newId(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness,
    seed: rand(),
    version: 1,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

function textEl(s: string, cx: number, cy: number, containerId: string | null, size = FONT): Json {
  const { width, height } = textSize(s, size);
  return {
    ...base('text', containerId ? cx - width / 2 : cx, containerId ? cy - height / 2 : cy, width, height, null),
    text: s,
    fontSize: size,
    fontFamily: 5,
    textAlign: containerId ? 'center' : 'left',
    verticalAlign: containerId ? 'middle' : 'top',
    containerId,
    originalText: s,
    autoResize: true,
    lineHeight: LINE_H,
  };
}

type Placed = { el: Json; cx: number; cy: number; hw: number; hh: number };

/** Where the line from `a`'s centre towards `b`'s centre leaves `a`, pushed out by the binding gap. */
function edgePoint(a: Placed, b: Placed): [number, number] {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (!dx && !dy) return [a.cx, a.cy - a.hh - GAP];
  const t = Math.min(dx ? (a.hw + GAP) / Math.abs(dx) : Infinity, dy ? (a.hh + GAP) / Math.abs(dy) : Infinity);
  return [a.cx + dx * t, a.cy + dy * t];
}

export function write(specText: string): string {
  const spec = parseSpec(specText);
  const pos = layout(spec);
  const labelled = spec.arrows.filter((a) => a.label).map((a) => ({ ...a, size: textSize(a.label!, LABEL_FONT) }));
  const loopW = (name: string) => Math.max(0, ...labelled.filter((a) => a.from === name && a.to === name).map((a) => a.size.width + 2 * (LABEL_MARGIN_X + LOOP_INSET)));
  const widths = new Map(spec.boxes.map((b) => [b.name, Math.max(BOX_W, textSize(b.name).width + 40, loopW(b.name))]));
  const colCount = Math.max(...[...pos.values()].map((p) => p.col)) + 1;
  const colW = Array.from({ length: colCount }, (_, c) => Math.max(...spec.boxes.filter((b) => pos.get(b.name)!.col === c).map((b) => widths.get(b.name)!)));
  const colGap = Array.from({ length: colCount }, (_, c) =>
    Math.max(
      COL_GAP,
      ...labelled
        .filter((a) => Math.min(pos.get(a.from)!.col, pos.get(a.to)!.col) === c && Math.abs(pos.get(a.from)!.col - pos.get(a.to)!.col) === 1)
        .map((a) => a.size.width + 2 * LABEL_MARGIN_X + 2 * GAP),
    ),
  );
  const colX = colW.map((_, c) => colW.slice(0, c).reduce((s, w, i) => s + w + colGap[i], 0));
  const rowGap = Math.max(
    ROW_GAP,
    ...labelled.filter((a) => a.from !== a.to && pos.get(a.from)!.col === pos.get(a.to)!.col).map((a) => a.size.height + 2 * LABEL_MARGIN_Y + 2 * GAP),
  );
  const rowPitch = BOX_H + rowGap;
  const rows = Array.from({ length: colCount }, (_, c) => spec.boxes.filter((b) => pos.get(b.name)!.col === c).length);
  const maxRows = Math.max(...rows);

  const elements: Json[] = [];
  const placed = new Map<string, Placed>();
  for (const b of spec.boxes) {
    const { col, row } = pos.get(b.name)!;
    const w = widths.get(b.name)!;
    const cx = colX[col] + colW[col] / 2;
    const cy = ((maxRows - rows[col]) * rowPitch) / 2 + row * rowPitch + BOX_H / 2;
    const el = base(b.shape, cx - w / 2, cy - BOX_H / 2, w, BOX_H, b.shape === 'rectangle' ? { type: 3 } : b.shape === 'diamond' ? { type: 2 } : null);
    const label = textEl(b.name, cx, cy, el.id as string);
    el.boundElements = [{ type: 'text', id: label.id }];
    placed.set(b.name, { el, cx, cy, hw: w / 2, hh: BOX_H / 2 });
    elements.push(el, label);
  }

  const labels: Json[] = [];
  for (const a of spec.arrows) {
    const from = placed.get(a.from)!;
    const to = placed.get(a.to)!;
    const self = from === to;
    const [x1, y1] = self ? [from.cx - from.hw + LOOP_INSET, from.cy - from.hh - GAP] : edgePoint(from, to);
    const [x2, y2] = self ? [from.cx + from.hw - LOOP_INSET, y1] : edgePoint(to, from);
    const points = self
      ? [
          [0, 0],
          [0, -40],
          [x2 - x1, -40],
          [x2 - x1, 0],
        ]
      : [
          [0, 0],
          [x2 - x1, y2 - y1],
        ];
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const el: Json = {
      ...base('arrow', x1, y1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), { type: 2 }),
      points,
      lastCommittedPoint: null,
      startBinding: { elementId: from.el.id, focus: 0, gap: GAP },
      endBinding: { elementId: to.el.id, focus: 0, gap: GAP },
      startArrowhead: a.heads === 'both' ? 'arrow' : null,
      endArrowhead: a.heads === 'none' ? null : 'arrow',
      elbowed: false,
    };
    const bound: Json[] = [];
    if (a.label) {
      const label = textEl(a.label, x1 + (x2 - x1) / 2, self ? y1 - 40 : y1 + (y2 - y1) / 2, el.id as string, LABEL_FONT);
      labels.push(label);
      bound.push({ type: 'text', id: label.id });
    }
    el.boundElements = bound.length ? bound : null;
    for (const end of self ? [from] : [from, to]) (end.el.boundElements as Json[]).push({ type: 'arrow', id: el.id });
    elements.push(el);
  }
  elements.push(...labels);

  let y = maxRows * rowPitch + 20;
  for (const n of spec.notes) {
    const note = textEl(n, 0, y, null);
    elements.push(note);
    y += (note.height as number) + 20;
  }

  elements.forEach((e, i) => (e.index = fractionalIndex(i)));
  return `${JSON.stringify({ type: 'excalidraw', version: 2, source: 'belay', elements, appState: { viewBackgroundColor: '#ffffff' }, files: {} }, null, 2)}\n`;
}
