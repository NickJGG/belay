/** Derives a project key from its name: three letters when free, four on a clash. */

const STOPWORDS = new Set(['A', 'AN', 'AND', 'FOR', 'IN', 'MY', 'OF', 'ON', 'THE', 'TO']);

function words(name: string): string[] {
  const all = name.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  const kept = all.filter((w) => !STOPWORDS.has(w));
  return kept.length ? kept : all;
}

/**
 * Three letters taken from the start of the words: initials for 3+ words (`Pixel Art Tool` → PAT),
 * one letter then two for two words (`Rideable Elevators` → REL), else the first three letters (`Portfolio` → POR).
 */
function base(w: string[]): string {
  if (w.length >= 3) return w.slice(0, 3).map((x) => x[0]).join('');
  if (w.length === 2 && w[1].length >= 2) return w[0][0] + w[1].slice(0, 2);
  return w.join('').slice(0, 3);
}

/** The first free key for `name`, comparing against `taken` (uppercase). Throws when none is free. */
export function suggestKey(name: string, taken: Iterable<string>): string {
  const w = words(name);
  const letters = w.join('');
  if (letters.length < 3) throw new Error(`can't derive a key from '${name}' — pass one (3–4 letters)`);
  const used = new Set(taken);
  const three = base(w);
  if (!used.has(three)) return three;
  for (const c of letters) {
    if (!used.has(three + c)) return three + c;
  }
  throw new Error(`'${three}' and its 4-letter variants are taken — pass a key (3–4 letters)`);
}
