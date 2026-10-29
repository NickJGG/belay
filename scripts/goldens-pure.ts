/**
 * Web goldens without a server: the shell's page rules (`pageKind`, `pageTab`, `missing`) over a fixed URL list, and
 * the sidebar's section rows over fixed places. Needs no data, so it runs outside test-env too:
 *   node scripts/goldens-pure.ts <code root> --out <file> [--paths <json>]
 * Diff the files from master and the branch.
 */
import { writeFileSync } from 'node:fs';
import { args, code } from './code.ts';

const { pos, flags } = args();
if (pos.length !== 1 || typeof flags.out !== 'string') throw new Error('usage: goldens-pure.ts <code root> --out <file> [--paths <json>]');
const c = code(pos[0], flags.paths as string | undefined);
const { pageKind, pageTab, missing } = await c.load('shell');
const { sidebarSections } = await c.load('sidebar');

const URLS = [
  '/',
  '/p',
  '/p/BEL',
  '/p/BEL/grills',
  '/p/BEL/activity',
  '/p/BEL/logs',
  '/p/BEL/other',
  '/p/unfiled',
  '/p/unfiled/grills',
  '/i/BEL-1',
  '/i/nonsense',
  '/l/2026-10-01/1',
  '/s/some-grill',
  '/s/some-grill/extra',
  '/s/a%20b',
  '/legacy/some-grill.md',
  '/learn',
  '/learn/c',
  '/learn/other',
  '/learn/c/map',
  '/learn/c/lessons',
  '/learn/c/lessons/lesson-1',
  '/learn/c/notes',
  '/learn/c/knowledge/topic',
  '/learn/c/sources/src',
  '/learn/c/misconceptions',
  '/learn/c/cards',
  '/learn/c/now',
  '/learn/c/work',
  '/learn/c/work/a/b.ts',
  '/learn/c/elsewhere/x',
  '/api/s/some-grill/files/a.png',
  '/nope',
];
const LIVE = [{ slug: 'some-grill' }, { slug: 'lesson-1', course: 'c' }];

const PLACES: [object, string][] = [];
for (const kind of ['reading', 'workspace']) {
  for (const [key, name] of [['BEL', 'Belay'], ['unfiled', 'Unfiled']]) {
    for (const path of ['', '/grills', '/activity', '/logs']) PLACES.push([{ kind, project: { key, name } }, `/p/${key}${path}`]);
    PLACES.push([{ kind, project: { key, name }, section: 'Grills' }, `/s/some-grill`]);
  }
  for (const path of ['', '/map', '/lessons', '/lessons/lesson-1', '/notes', '/knowledge/topic', '/work', '/now', '/cards']) {
    PLACES.push([{ kind, course: { slug: 'c', title: 'Course' } }, `/learn/c${path}`]);
  }
  PLACES.push([{ kind }, '/']);
}

const out = {
  pages: URLS.map((url) => ({ url, kind: pageKind(url), tab: pageTab(url, LIVE), tabNoLive: pageTab(url, []), missing: missing(url) })),
  sidebar: PLACES.map(([place, url]) => ({ place, url, sections: sidebarSections(place, url) })),
};
writeFileSync(flags.out, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${URLS.length} pages, ${PLACES.length} places in ${flags.out}`);
