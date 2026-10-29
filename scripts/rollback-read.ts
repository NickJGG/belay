/**
 * Rollback check, read step: loads the data dir with a code root's own store and reports what a save would do.
 *   test-env.sh <working> node scripts/rollback-read.ts <code root> [--strict] [--paths <json>] [--out <file>]
 * Prints (or writes) a JSON report: the bad files, and for each issue whether re-saving it is byte-identical, and if
 * not, whether it is idempotent, which frontmatter keys it drops, and whether the kept values compare equal.
 * Imports only modules free of `server-only`. Writes nothing but the root's own issue cache.
 */
import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { args, code, need } from './code.ts';

const { pos, flags } = args();
if (pos.length !== 1) throw new Error('usage: rollback-read.ts <code root> [--strict] [--paths <json>] [--out <file>]');
const c = code(pos[0], flags.paths as string | undefined);
const dir = need('BELAY_DATA');
const store = await c.load('store');
const { Ctx } = await c.load('ops');
const { parseDocument } = c.yaml();

/** Frontmatter as plain data, keys in file order; `intAsBigInt` so a lossy number shows up as unequal. */
function frontmatter(text: string): { keys: string[]; data: unknown } {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/.exec(text);
  const doc = parseDocument(m?.[1] ?? '', { intAsBigInt: true });
  const items = (doc.contents as { items?: { key: unknown }[] } | null)?.items ?? [];
  const keys = items.map((p) => String((p.key as { value?: unknown })?.value ?? p.key));
  return { keys, data: doc.toJS({ maxAliasCount: -1 }) };
}

const pick = (data: unknown, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (data as Record<string, unknown>)?.[k]]));

let strictError: string | undefined;
if (flags.strict) {
  try {
    new Ctx(dir);
  } catch (e) {
    strictError = (e as Error).message;
  }
}

const ctx = new Ctx(dir, { lenient: true });
const changed: { file: string; idempotent: boolean; dropped: string[]; valuesEqual: boolean }[] = [];
let identical = 0;
for (const issue of ctx.issues) {
  const file = `issues/${issue.id.toLowerCase()}.md`;
  const src = readFileSync(join(dir, file), 'utf8');
  const once = store.serializeIssue(issue);
  if (once === src) {
    identical++;
    continue;
  }
  const twice = store.serializeIssue(store.parseIssue(once, file));
  const before = frontmatter(src);
  const after = frontmatter(once);
  const kept = after.keys.filter((k) => before.keys.includes(k));
  changed.push({
    file,
    idempotent: twice === once,
    dropped: before.keys.filter((k) => !after.keys.includes(k)),
    valuesEqual: isDeepStrictEqual(pick(before.data, kept), pick(after.data, kept)),
  });
}

const report = {
  issues: ctx.issues.length,
  projects: ctx.projects.length,
  bad: [...ctx.bad].sort((a, b) => a.file.localeCompare(b.file)),
  ...(flags.strict && { strictError: strictError ?? null }),
  identical,
  changed: changed.sort((a, b) => a.file.localeCompare(b.file)),
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (typeof flags.out === 'string') writeFileSync(flags.out, json);
else process.stdout.write(json);
