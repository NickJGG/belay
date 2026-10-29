/**
 * The import rule: only an extension's own files, each layer's built-in list, and scripts/ may import an extension's
 * code. Its files are its folders (`src/extensions/<id>/`, `web/src/app/(browse)/(<id>)/`, `bridge/kinds/<id>.*mts`,
 * `bridge/test/kinds/<id>.test.mts`) plus `OWNED_UNMOVED`, the files still waiting to move there. Edges that break the rule today are frozen in
 * `test/import-pending.json`, and each phase that moves code removes its own.
 *   node scripts/import-rule.ts           prints the edges that break the rule
 *   node scripts/import-rule.ts --write   freezes them as the pending list
 * A regex scanner, since root TS has no parser API: it reads static imports, `import type`, `export … from` and
 * `import()` with a literal, after blanking comments and masking strings. JSX text with an apostrophe can still
 * unbalance its string masking, which at worst misses an edge.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isExtensionId, type ExtensionId } from '../src/extension-ids.ts';

export const ROOT = resolve(import.meta.dirname, '..');
export const PENDING_FILE = join(ROOT, 'test', 'import-pending.json');

const SCAN = ['src', 'test', 'scripts', 'bridge', 'web/src'];
const SOURCE = /\.(ts|tsx|mts)$/;

/** Files and folders (ending in `/`) an extension owns before they move into its folders. */
export const OWNED_UNMOVED: Record<string, ExtensionId> = {};

/** May import any extension's code; listed whether or not the file exists yet. */
export const BUILT_IN_LISTS = new Set([
  'src/extensions.ts',
  'web/src/lib/extensions.ts',
  'web/src/lib/extensions.server.ts',
  'web/src/lib/extensions.client.ts',
  'web/src/lib/extensions.markdown.ts',
  'web/src/lib/extensions.generated.ts',
  'web/src/lib/extensions.server.generated.ts',
  'web/src/lib/extensions.client.generated.ts',
  'web/src/lib/extensions.markdown.generated.ts',
  'bridge/kinds/index.mts',
]);

const FOLDERS = [
  /^src\/extensions\/([^/]+)\//,
  /^web\/src\/app\/\(browse\)\/\(([^/]+)\)\//,
  /^bridge\/kinds\/([^/.]+)(?:\.[^/]+)?\.mts$/,
  /^bridge\/test\/kinds\/([^/.]+)\.test\.mts$/,
];

export function ownerOf(file: string): ExtensionId | undefined {
  for (const re of FOLDERS) {
    const id = re.exec(file)?.[1];
    if (id && isExtensionId(id)) return id;
  }
  for (const [path, id] of Object.entries(OWNED_UNMOVED)) if (path.endsWith('/') ? file.startsWith(path) : file === path) return id;
}

export function mayImport(importer: string, target: string): boolean {
  const owner = ownerOf(target);
  return !owner || ownerOf(importer) === owner || BUILT_IN_LISTS.has(importer) || importer.startsWith('scripts/');
}

const isRegexStart = (prev: string) => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|do|else|in|of|void)$/.test(prev);

/** Blanks comments and replaces each string or template literal with `"S<n>"`; returns that text and the strings. */
export function mask(src: string): { code: string; strings: string[] } {
  const strings: string[] = [];
  let code = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      code += ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') s += src[++j];
        else if (c !== '`' && src[j] === '\n') break;
        else s += src[j];
        j++;
      }
      code += `"S${strings.push(s) - 1}"`;
      i = j + 1;
    } else if (c === '/' && isRegexStart(code.trimEnd())) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n' && (inClass || src[j] !== '/')) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      code += '/R/';
      i = j + 1;
    } else {
      code += c;
      i++;
    }
  }
  return { code, strings };
}

const PATTERNS = [
  /\bimport\s+(?:type\s+)?[\w$*{}\s,]*?\bfrom\s*"S(\d+)"/g,
  /\bimport\s*"S(\d+)"/g,
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*"S(\d+)"/g,
  /\bimport\s*\(\s*"S(\d+)"\s*[,)]/g,
];

/** Every module specifier the source imports or re-exports, in order of appearance per form. */
export function specifiers(src: string): string[] {
  const { code, strings } = mask(src);
  return PATTERNS.flatMap((re) => [...code.matchAll(re)].map((m) => strings[Number(m[1])]));
}

const posix = (p: string) => p.replaceAll('\\', '/');
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

/** The repo-relative file a specifier names, or null for a package. */
export function resolveSpecifier(importer: string, spec: string, root = ROOT): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, 'web/src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(root, dirname(importer), spec);
  else return null;
  const swapped = base.replace(/\.m?js$/, (e) => (e === '.mjs' ? '.mts' : '.ts'));
  const hit = [base, swapped, ...['.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'].map((e) => base + e)].find(isFile);
  return hit ? posix(relative(root, hit)) : null;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SOURCE.test(e.name)) out.push(p);
  }
}

/** `importer -> target` for every import that breaks the rule, sorted. */
export function violations(root = ROOT): string[] {
  const files: string[] = [];
  for (const d of SCAN) walk(join(root, d), files);
  const edges = new Set<string>();
  for (const abs of files) {
    const importer = posix(relative(root, abs));
    for (const spec of specifiers(readFileSync(abs, 'utf8'))) {
      const target = resolveSpecifier(importer, spec, root);
      if (target && !mayImport(importer, target)) edges.add(`${importer} -> ${target}`);
    }
  }
  return [...edges].sort();
}

export const readPending = (): string[] => JSON.parse(readFileSync(PENDING_FILE, 'utf8'));

if (import.meta.main) {
  const found = violations();
  if (process.argv.includes('--write')) {
    writeFileSync(PENDING_FILE, `${JSON.stringify(found, null, 2)}\n`);
    console.log(`${found.length} pending edges in ${relative(ROOT, PENDING_FILE)}`);
  } else console.log(found.join('\n'));
}
