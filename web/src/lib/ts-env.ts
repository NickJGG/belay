/*
 * The Work editor's TypeScript checking: Node 24 running a file directly, as ▶ Run does. Import-free at
 * runtime (`ts` is passed in), so the worker, the server route and tests all share it.
 */
import type * as TS from "typescript";

/** Files the editor type-checks: the ones Node runs, plus `.tsx`. */
export const tsChecked = (path: string) => /\.(ts|tsx|js|mjs|cjs)$/.test(path);

/** The `lib` compiler option. `dom` alone would type `console`; Node's own types come from `@types/node`. */
export const LIBS = ["es2023", "dom"];

export function compilerOptions(ts: typeof TS): TS.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2023,
    lib: LIBS.map((name) => `lib.${name}.d.ts`),
    types: ["node"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    // Each work file is its own program to Node, so top-level names never clash across files.
    moduleDetection: ts.ModuleDetectionKind.Force,
    // Node's type stripping: `.ts` import paths, and no enum or namespace.
    allowImportingTsExtensions: true,
    erasableSyntaxOnly: true,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    checkJs: true,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
}

const REFERENCE = /^\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/gm;

/** `lib.<name>.d.ts` for each of `names` and every lib they reference, keyed `/lib.<name>.d.ts` as `@typescript/vfs` expects. */
export function libFiles(names: string[], read: (file: string) => string): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (name: string) => {
    const file = `lib.${name.toLowerCase()}.d.ts`;
    if (files.has(`/${file}`)) return;
    const text = read(file);
    files.set(`/${file}`, text);
    for (const [, ref] of text.matchAll(REFERENCE)) visit(ref);
  };
  names.forEach(visit);
  return files;
}
