import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";
import ts from "typescript";
import { compilerOptions, libFiles, tsChecked } from "../../web/_lib/ts-env.ts";
import { tsEnvFiles } from "../../web/_lib/ts-env-files.ts";

describe("libFiles", () => {
  test("follows lib references transitively, once each", () => {
    const libs: Record<string, string> = {
      "lib.a.d.ts": '/// <reference no-default-lib="true"/>\n/// <reference lib="b" />\n/// <reference lib="c" />\n',
      "lib.b.d.ts": '/// <reference lib="c" />\ninterface B {}\n',
      "lib.c.d.ts": "interface C {}\n",
    };
    const reads: string[] = [];
    const files = libFiles(["a"], (f) => (reads.push(f), libs[f]));
    assert.deepEqual([...files.keys()], ["/lib.a.d.ts", "/lib.b.d.ts", "/lib.c.d.ts"]);
    assert.deepEqual(reads, ["lib.a.d.ts", "lib.b.d.ts", "lib.c.d.ts"]);
  });

  test("ignores a reference that isn't a triple-slash directive", () => {
    const files = libFiles(["a"], () => ' * see /// <reference lib="x" /> in the docs\n');
    assert.deepEqual([...files.keys()], ["/lib.a.d.ts"]);
  });
});

describe("the editor's TypeScript environment", () => {
  const files = tsEnvFiles(path.join(import.meta.dirname, "..", "..", "..", "..", "web"));
  const env = createVirtualTypeScriptEnvironment(createSystem(new Map(Object.entries(files))), [], ts, compilerOptions(ts));
  let n = 0;
  const codes = (code: string, ext = "ts") => {
    const file = `/f${n++}.${ext}`;
    env.createFile(file, code);
    return [...env.languageService.getSyntacticDiagnostics(file), ...env.languageService.getSemanticDiagnostics(file)].map((d) => d.code);
  };

  test("holds the libs and Node's types", () => {
    for (const f of ["/lib.es5.d.ts", "/lib.decorators.d.ts", "/lib.es2023.array.d.ts", "/lib.dom.d.ts", "/node_modules/@types/node/index.d.ts", "/node_modules/undici-types/index.d.ts"]) {
      assert.ok(f in files, f);
    }
  });

  test("a clean file has no diagnostics, with console, Node and es2023", () => {
    const code = [
      'import { readFileSync } from "node:fs";',
      'const input: string = readFileSync(0, "utf8") + process.argv.length;',
      "console.log([3, 1, 2].toSorted().findLast((x) => x > 1), input);",
    ].join("\n");
    assert.deepEqual(codes(code), []);
  });

  test("a wrong argument type is TS2345", () => {
    assert.deepEqual(codes("function isPalindrome(s: string) { return s; }\nisPalindrome(121);"), [2345]);
  });

  test("files are modules, so the same name in two files doesn't clash", () => {
    assert.deepEqual(codes("function solve() {}"), []);
    assert.deepEqual(codes("function solve() {}"), []);
  });

  test("an enum is flagged, as Node's type stripping rejects it", () => {
    assert.deepEqual(codes("enum E { A }"), [1294]);
  });

  test("CommonJS JavaScript is checked with require typed", () => {
    assert.deepEqual(codes('const fs = require("fs");\n/** @type {number} */\nconst n = fs.readFileSync(0, "utf8");', "cjs"), [2322]);
  });

  test("completions after `str.` list string methods", () => {
    const file = `/f${n++}.ts`;
    const code = 'const str = "abc";\nstr.';
    env.createFile(file, code);
    const names = env.languageService.getCompletionsAtPosition(file, code.length, {})?.entries.map((e) => e.name) ?? [];
    assert.ok(names.includes("toUpperCase") && names.includes("at"), names.slice(0, 10).join());
  });
});

describe("tsChecked", () => {
  test("is the files Node runs, plus .tsx", () => {
    for (const f of ["a.ts", "d/a.tsx", "a.js", "a.mjs", "a.cjs"]) assert.ok(tsChecked(f), f);
    for (const f of ["a.py", "a.md", "a.ts.in", "a.json", "ts"]) assert.ok(!tsChecked(f), f);
  });
});
