import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { generate, isGenerated, routeExports } from '../src/generate.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'belay-gen-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const has = (rel: string) => existsSync(join(root, rel));

function extension(id: string): void {
  put(`extensions/${id}/belay.json`, JSON.stringify({ id, name: id, summary: id, mark: { path: 'M0 0', dot: { x: 0, y: 0, r: 1 } }, paths: [`/${id}`], sessions: `${id}s` }));
}

const STUBS = 'web/src/app/(browse)';

test('routeExports reads the names Next uses, default first, and refuses segment config', () => {
  const src = [
    'export const metadata = { title: "x" };',
    'export default async function Page() {}',
    'export async function generateMetadata() {}',
    'export function helper() {}',
    'export { GET, handler as POST, type Thing };',
  ].join('\n');
  assert.deepEqual(routeExports(src, 'f'), ['default', 'generateMetadata', 'GET', 'metadata', 'POST']);
  assert.throws(() => routeExports('export const dynamic = "force-dynamic";\nexport default function P() {}', 'f'), /segment config \(dynamic\)/);
  assert.throws(() => routeExports('export function helper() {}', 'f'), /exports nothing/);
});

test("stubs re-export each installed extension's route files, skipping private folders", () => {
  extension('demo');
  put('extensions/demo/web/demo/page.tsx', 'export const metadata = {};\nexport default function P() { return "x"; }\n');
  put('extensions/demo/web/demo/[slug]/error.tsx', '// why\n"use client";\nexport default function E() { return null; }\n');
  put('extensions/demo/web/api/demo/[id]/route.ts', 'export async function GET() {}\n');
  put('extensions/demo/web/_components/page.tsx', 'export default function NotARoute() {}\n');
  put('extensions/demo/web/demo/view.tsx', 'export default function NotARouteEither() {}\n');
  generate(root);

  assert.equal(
    read(`${STUBS}/(demo)/demo/page.tsx`),
    '// Generated from extensions/demo/web/demo/page.tsx: edit that file.\nexport { default, metadata } from "../../../../../../extensions/demo/web/demo/page.tsx";\n',
  );
  assert.equal(
    read(`${STUBS}/(demo)/demo/[slug]/error.tsx`),
    '// Generated from extensions/demo/web/demo/[slug]/error.tsx: edit that file.\n"use client";\nexport { default } from "../../../../../../../extensions/demo/web/demo/[slug]/error.tsx";\n',
  );
  assert.match(read(`${STUBS}/(demo)/api/demo/[id]/route.ts`), /^export \{ GET \} from "(\.\.\/){8}extensions\/demo\/web\/api\/demo\/\[id\]\/route\.ts";$/m);
  assert.equal(has(`${STUBS}/(demo)/_components/page.tsx`), false);
  assert.equal(has(`${STUBS}/(demo)/demo/view.tsx`), false);
  assert.equal(read(`${STUBS}/(demo)/.gitignore`).split('\n')[1], '*');
});

test("the layer lists import each installed extension's manifests, from its web/ or else its folder in the site", () => {
  extension('alpha');
  extension('beta-two');
  extension('gamma');
  put('extensions/alpha/web/_lib/manifest.ts', '');
  put('extensions/alpha/web/_lib/markdown.ts', '');
  put(`${STUBS}/(beta-two)/_lib/manifest.ts`, '');
  put(`${STUBS}/(gamma)/_lib/manifest.ts`, '');
  put('extensions/installed.json', JSON.stringify({ installed: ['alpha', 'beta-two'] }));
  generate(root);

  const pure = read('web/src/lib/extensions.generated.ts');
  assert.ok(isGenerated(pure));
  assert.match(pure, /^import \{ manifest as alpha_manifest \} from "\.\.\/\.\.\/\.\.\/extensions\/alpha\/web\/_lib\/manifest\.ts";$/m);
  assert.match(pure, /^import \{ manifest as beta_two_manifest \} from "\.\.\/app\/\(browse\)\/\(beta-two\)\/_lib\/manifest\.ts";$/m);
  assert.match(pure, /^export const MANIFESTS = \[alpha_manifest, beta_two_manifest\] as const;$/m);
  assert.doesNotMatch(pure, /gamma/);
  assert.match(read('web/src/lib/extensions.markdown.generated.ts'), /^export const HANDLERS = \{ "alpha": alpha_markdown \} as const;$/m);
  assert.match(read('web/src/lib/extensions.server.generated.ts'), /^export const KINDS = \[\] as const;$/m);
  const tsconfig = read('web/tsconfig.extensions.json');
  assert.deepEqual(JSON.parse(tsconfig.slice(tsconfig.indexOf('\n'))).include.slice(-4), [
    '../extensions/alpha/web/**/*.ts',
    '../extensions/alpha/web/**/*.tsx',
    '../extensions/beta-two/web/**/*.ts',
    '../extensions/beta-two/web/**/*.tsx',
  ]);
});

test('an unchanged file is not rewritten', () => {
  extension('demo');
  put('extensions/demo/web/demo/page.tsx', 'export default function P() {}\n');
  assert.ok(generate(root).written.includes(`${STUBS}/(demo)/demo/page.tsx`));
  const before = statSync(join(root, `${STUBS}/(demo)/demo/page.tsx`)).mtimeMs;
  assert.deepEqual(generate(root), { written: [], removed: [] });
  assert.equal(statSync(join(root, `${STUBS}/(demo)/demo/page.tsx`)).mtimeMs, before);
});

test("stale stubs go, and an uninstalled extension's folder with them, but never a file that isn't generated", () => {
  extension('demo');
  extension('other');
  put('extensions/demo/web/demo/page.tsx', 'export default function P() {}\n');
  put('extensions/demo/web/demo/old/page.tsx', 'export default function P() {}\n');
  put('extensions/other/web/other/page.tsx', 'export default function P() {}\n');
  generate(root);
  put(`${STUBS}/(demo)/demo/notes.md`, 'mine\n');
  rmSync(join(root, 'extensions/demo/web/demo/old'), { recursive: true });
  put('extensions/installed.json', JSON.stringify({ installed: ['demo'] }));

  const { removed } = generate(root);
  assert.deepEqual(removed.sort(), [`${STUBS}/(demo)/demo/old/page.tsx`, `${STUBS}/(other)/.gitignore`, `${STUBS}/(other)/other/page.tsx`]);
  assert.equal(has(`${STUBS}/(demo)/demo/old`), false);
  assert.equal(has(`${STUBS}/(other)`), false);
  assert.equal(read(`${STUBS}/(demo)/demo/notes.md`), 'mine\n');
  assert.ok(has(`${STUBS}/(demo)/demo/page.tsx`));
});

test('only folders named for a valid id are swept', () => {
  put(`${STUBS}/(Bad_Id)/page.tsx`, '// Generated from extensions/x/web/page.tsx: edit that file.\n');
  put(`${STUBS}/plain/page.tsx`, '// Generated from extensions/x/web/page.tsx: edit that file.\n');
  put(`${STUBS}/(gone)/page.tsx`, '// Generated from extensions/gone/web/page.tsx: edit that file.\n');
  put(`${STUBS}/(gone)/page.module.css`, '.a {}\n');
  assert.deepEqual(generate(root).removed, [`${STUBS}/(gone)/page.tsx`]);
  assert.ok(has(`${STUBS}/(Bad_Id)/page.tsx`));
  assert.ok(has(`${STUBS}/plain/page.tsx`));
  assert.ok(has(`${STUBS}/(gone)/page.module.css`));
});

test("a route file that would land on a file that isn't generated is refused before anything is written", () => {
  extension('demo');
  put('extensions/demo/web/demo/page.tsx', 'export default function P() {}\n');
  put(`${STUBS}/(demo)/demo/page.tsx`, 'export default function Handwritten() {}\n');
  assert.throws(() => generate(root), /\(demo\)\/demo\/page\.tsx isn't generated: refusing to overwrite it/);
  assert.equal(read(`${STUBS}/(demo)/demo/page.tsx`), 'export default function Handwritten() {}\n');
  assert.equal(has('web/src/lib/extensions.generated.ts'), false);
});
