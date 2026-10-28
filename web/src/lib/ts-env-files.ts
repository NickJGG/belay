import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { LIBS, libFiles } from "./ts-env.ts";

/**
 * Every declaration file the editor's language service reads, by its path in the worker's virtual file
 * system: TypeScript's libs at `/`, and `@types/node` with its `undici-types` under `/node_modules`.
 */
export function tsEnvFiles(webRoot: string): Record<string, string> {
  const modules = path.join(webRoot, "node_modules");
  const files = libFiles(LIBS, (file) => readFileSync(path.join(modules, "typescript", "lib", file), "utf8"));
  const nodeTypes = realpathSync(path.join(modules, "@types", "node"));
  // pnpm keeps undici-types beside @types/node, not at the top of node_modules.
  const undici = path.dirname(createRequire(path.join(nodeTypes, "package.json")).resolve("undici-types/package.json"));
  addPackage(files, nodeTypes, "/node_modules/@types/node");
  addPackage(files, undici, "/node_modules/undici-types");
  return Object.fromEntries(files);
}

function addPackage(files: Map<string, string>, dir: string, at: string) {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !(entry.name.endsWith(".d.ts") || entry.name === "package.json")) continue;
    const abs = path.join(entry.parentPath, entry.name);
    files.set(`${at}/${path.relative(dir, abs).split(path.sep).join("/")}`, readFileSync(abs, "utf8"));
  }
}
