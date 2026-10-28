/*
 * Running a work/ file from the Work tab. Import-free, so the editor can ask whether a file runs.
 * A run's stdin is the file's `.in` sidecar, which the tree hides.
 */

const NODE = /\.(ts|js|mjs|cjs)$/;

/** How to run `rel` from its own folder, or null when it doesn't run. Node 24 strips TS types itself. */
export function runCommand(rel: string): { cmd: "node" | "python"; args: string[] } | null {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  if (NODE.test(name)) return { cmd: "node", args: [name] };
  if (name.endsWith(".py")) return { cmd: "python", args: ["-u", name] };
  return null;
}

export const inputPath = (rel: string) => `${rel}.in`;

/** `X.in` beside an `X` in the same folder; a lone `.in` is an ordinary file. */
export function isInputSidecar(name: string, siblings: Iterable<string>): boolean {
  if (!name.endsWith(".in") || name.length <= 3) return false;
  const target = name.slice(0, -3);
  for (const s of siblings) if (s === target) return true;
  return false;
}

/** One line of a run's NDJSON stream: output in order, then how it ended. */
export type RunEvent = { s: "out" | "err"; t: string } | { exit: number | null; ms: number; capped?: boolean; stopped?: boolean };
