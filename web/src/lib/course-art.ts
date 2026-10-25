/*
 * Per-course art: a palette slot and a seeded contour terrain, both deterministic so a course
 * looks the same on every page and render.
 */

/** Course colours, by palette slot; each reads in both themes. */
export const PALETTE = ["#4aa3e8", "#2bb3a3", "#e0a43a", "#8b7cf6", "#e06c8a", "#6cc070", "#e5774a"];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Marching-squares segments per cell case, as pairs of edges (0 top, 1 right, 2 bottom, 3 left). */
const CASES: Record<number, [number, number][]> = {
  1: [[3, 2]],
  2: [[2, 1]],
  3: [[3, 1]],
  4: [[0, 1]],
  5: [[3, 0], [2, 1]],
  6: [[0, 2]],
  7: [[3, 0]],
  8: [[3, 0]],
  9: [[0, 2]],
  10: [[3, 2], [0, 1]],
  11: [[0, 1]],
  12: [[3, 1]],
  13: [[2, 1]],
  14: [[3, 2]],
};

const STEP = 5;
const LEVELS = 9;

/** Contour lines over 2–4 seeded gaussian hills and a slight tilt: one path per level, 1 lowest. */
export function terrain(slug: string, w: number, h: number): { d: string; level: number }[] {
  const R = mulberry32(hash(slug));
  const peaks = Array.from({ length: 2 + Math.floor(R() * 3) }, () => ({
    x: w * (0.1 + R() * 0.8),
    y: h * (0.1 + R() * 0.8),
    hh: 0.5 + R() * 0.6,
    sx: 30 + R() * 70,
    sy: 20 + R() * 35,
  }));
  const tilt = (R() - 0.5) * 0.3;
  const f = (x: number, y: number) =>
    peaks.reduce(
      (s, p) => s + p.hh * Math.exp(-((x - p.x) ** 2 / (2 * p.sx ** 2) + (y - p.y) ** 2 / (2 * p.sy ** 2))),
      0,
    ) + tilt * (x / w);

  const nx = Math.ceil(w / STEP) + 1;
  const ny = Math.ceil(h / STEP) + 1;
  const g = Array.from({ length: ny }, (_, j) => Array.from({ length: nx }, (_, i) => f(i * STEP, j * STEP)));

  const out: { d: string; level: number }[] = [];
  for (let level = 1; level <= LEVELS; level++) {
    const lv = level * 0.11 - 0.05;
    let d = "";
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = g[j][i], b = g[j][i + 1], c = g[j + 1][i + 1], e = g[j + 1][i];
        const segs = CASES[(a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (e > lv ? 1 : 0)];
        if (!segs) continue;
        const x0 = i * STEP, y0 = j * STEP;
        const t = (p: number, q: number) => (lv - p) / (q - p);
        const E = [
          [x0 + STEP * t(a, b), y0],
          [x0 + STEP, y0 + STEP * t(b, c)],
          [x0 + STEP * t(e, c), y0 + STEP],
          [x0, y0 + STEP * t(a, e)],
        ];
        for (const [p, q] of segs) {
          d += `M${E[p][0].toFixed(1)} ${E[p][1].toFixed(1)}L${E[q][0].toFixed(1)} ${E[q][1].toFixed(1)}`;
        }
      }
    }
    if (d) out.push({ d, level });
  }
  return out;
}
