import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { mayImport, OWNED_UNMOVED, ownerOf, readPending, ROOT, resolveSpecifier, specifiers, violations } from '../scripts/import-rule.ts';

test('only an extension, the built-in lists and scripts/ import extension code, beyond the frozen pending edges', () => {
  const found = new Set(violations());
  const pending = new Set(readPending());
  assert.deepEqual([...found].filter((e) => !pending.has(e)), [], 'new edges into extension code: import through a slot instead');
  assert.deepEqual([...pending].filter((e) => !found.has(e)), [], 'stale pending edges: remove them from test/import-pending.json');
});

test('every owned-but-unmoved path still exists', () => {
  assert.deepEqual(Object.keys(OWNED_UNMOVED).filter((p) => !existsSync(join(ROOT, p))), []);
});

test('the scanner reads every import form and skips comments and strings', () => {
  const src = [
    "import a from './a';",
    "import type { B } from \"./b\";",
    "import './side.css';",
    "export * from './c';",
    "export { d as e } from './d';",
    "export type { F } from './f';",
    'const g = await import(/* x */ "./g");',
    '// import h from "./h";',
    '/* import i from "./i"; */',
    'const s = "import j from \'./j\'";',
    'const re = /import k from "k"/;',
    "const t = `import(${'./l'})`;",
    'import {',
    '  m,',
    "} from '@/lib/m';",
  ].join('\n');
  assert.deepEqual(specifiers(src).sort(), ['./a', './b', './c', './d', './f', './g', './side.css', '@/lib/m'].sort());
});

test('specifiers resolve with or without an extension, through @/, and .mjs to its .mts source', () => {
  assert.equal(resolveSpecifier('src/cli.ts', './grill.ts'), 'src/grill.ts');
  assert.equal(resolveSpecifier('web/src/lib/data.ts', './courses'), 'web/src/lib/courses.ts');
  assert.equal(resolveSpecifier('web/src/app/layout.tsx', '@/lib/courses'), 'web/src/lib/courses.ts');
  assert.equal(resolveSpecifier('bridge/server.mts', './lesson.mjs'), 'bridge/lesson.mts');
  assert.equal(resolveSpecifier('src/cli.ts', 'yaml'), null);
});

test("an extension's folders across layers are one owner", () => {
  assert.equal(ownerOf('src/extensions/learn/x.ts'), 'learn');
  assert.equal(ownerOf('web/src/app/(browse)/(learn)/_lib/x.ts'), 'learn');
  assert.equal(ownerOf('bridge/kinds/learn.mts'), 'learn');
  assert.equal(ownerOf('bridge/kinds/index.mts'), undefined);
  assert.equal(ownerOf('web/src/lib/courses.ts'), 'learn');
  assert.equal(ownerOf('web/src/lib/data.ts'), undefined);
  assert.equal(mayImport('bridge/kinds/learn.mts', 'web/src/app/(browse)/(learn)/_lib/x.ts'), true);
  assert.equal(mayImport('src/extensions/grill/x.ts', 'src/extensions/learn/y.ts'), false);
  assert.equal(mayImport('src/extensions.ts', 'src/extensions/learn/manifest.ts'), true);
  assert.equal(mayImport('scripts/x.ts', 'web/src/lib/courses.ts'), true);
  assert.equal(mayImport('src/cli.ts', 'src/extensions/learn/manifest.ts'), false);
});
