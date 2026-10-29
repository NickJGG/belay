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

test("every extension's code has moved into its folders, with no edge left pending", () => {
  assert.deepEqual(OWNED_UNMOVED, {});
  assert.deepEqual(readPending(), []);
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
  assert.equal(resolveSpecifier('src/cli.ts', './store.ts'), 'src/store.ts');
  assert.equal(resolveSpecifier('web/src/lib/data.ts', './sessions'), 'web/src/lib/sessions.ts');
  assert.equal(resolveSpecifier('web/src/app/layout.tsx', '@/lib/sessions'), 'web/src/lib/sessions.ts');
  assert.equal(resolveSpecifier('bridge/server.mts', './files.mjs'), 'bridge/files.mts');
  assert.equal(resolveSpecifier('src/cli.ts', 'yaml'), null);
});

test("an extension's folders across layers are one owner", () => {
  assert.equal(ownerOf('extensions/learn/cli/x.ts'), 'learn');
  assert.equal(ownerOf('extensions/learn/web/_lib/x.ts'), 'learn');
  assert.equal(ownerOf('extensions/learn/bridge/learn.runtime.mts'), 'learn');
  assert.equal(ownerOf('web/src/app/(browse)/(learn)/learn/page.tsx'), undefined);
  assert.equal(ownerOf('extensions/grill/test/bridge/grill.test.mts'), 'grill');
  assert.equal(ownerOf('extensions/grill/web/_lib/mock.ts'), 'grill');
  assert.equal(ownerOf('extensions/grill/cli/manifest.ts'), 'grill');
  assert.equal(ownerOf('extensions/nope/x.ts'), undefined);
  assert.equal(ownerOf('bridge/kinds/index.mts'), undefined);
  assert.equal(ownerOf('bridge/test/settings.test.mts'), undefined);
  assert.equal(ownerOf('web/src/lib/data.ts'), undefined);
  assert.equal(mayImport('extensions/learn/bridge/learn.mts', 'extensions/learn/web/_lib/x.ts'), true);
  assert.equal(mayImport('extensions/grill/cli/x.ts', 'extensions/learn/cli/y.ts'), false);
  assert.equal(mayImport('web/src/lib/extensions.server.ts', 'extensions/learn/web/_lib/runtime.server.ts'), false);
  assert.equal(mayImport('src/extensions.generated.ts', 'extensions/grill/cli/manifest.ts'), true);
  assert.equal(mayImport('src/extensions.ts', 'extensions/grill/cli/manifest.ts'), false);
  assert.equal(mayImport('web/src/app/(browse)/(grill)/s/[slug]/page.tsx', 'extensions/grill/web/s/[slug]/page.tsx', true), true);
  assert.equal(mayImport('scripts/x.ts', 'extensions/learn/web/_lib/courses.ts'), true);
  assert.equal(mayImport('src/cli.ts', 'extensions/grill/cli/manifest.ts'), false);
});
