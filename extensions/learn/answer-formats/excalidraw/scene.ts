/** Reading an `.excalidraw` file: the fields the summary uses, and plane geometry over them. */

export type Binding = { elementId: string } | null | undefined;

export type Element = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  frameId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  containerId?: string | null;
  text?: string;
  originalText?: string;
  name?: string | null;
  points?: [number, number][];
  startBinding?: Binding;
  endBinding?: Binding;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
};

export type Scene = { elements: Element[]; byId: Map<string, Element> };

export function parseScene(text: string): Scene {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`not an Excalidraw file: ${(e as Error).message}`);
  }
  const d = data as { type?: unknown; elements?: unknown };
  if (d?.type !== 'excalidraw' || !Array.isArray(d.elements)) throw new Error('not an Excalidraw file: expected {"type":"excalidraw","elements":[…]}');
  const elements = (d.elements as Element[]).filter((e) => e && typeof e.id === 'string' && !e.isDeleted);
  return { elements, byId: new Map(elements.map((e) => [e.id, e])) };
}

export type Point = [number, number];
export type Rect = { x1: number; y1: number; x2: number; y2: number };

/** Axis-aligned bounds; rotation is ignored. Width and height may be negative on lines. */
export function rectOf(e: Element): Rect {
  if (e.points?.length) {
    const xs = e.points.map((p) => e.x + p[0]);
    const ys = e.points.map((p) => e.y + p[1]);
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }
  return {
    x1: Math.min(e.x, e.x + e.width),
    y1: Math.min(e.y, e.y + e.height),
    x2: Math.max(e.x, e.x + e.width),
    y2: Math.max(e.y, e.y + e.height),
  };
}

export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x1 - b.x2, b.x1 - a.x2);
  const dy = Math.max(0, a.y1 - b.y2, b.y1 - a.y2);
  return Math.hypot(dx, dy);
}

export const pointRect = ([x, y]: Point): Rect => ({ x1: x, y1: y, x2: x, y2: y });

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

export function arrowEnds(e: Element): [Point, Point] {
  const pts = e.points?.length ? e.points : [[0, 0] as Point];
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [
    [e.x + first[0], e.y + first[1]],
    [e.x + last[0], e.y + last[1]],
  ];
}
