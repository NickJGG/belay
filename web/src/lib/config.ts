import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { grillsDir, lessonsDir, runDir } from "../../../src/config.ts";

export { grillsDir, lessonsDir, runDir };

/** A session's folder: its grill, else its lesson; null when neither root has the slug. */
export function sessionDir(slug: string): string | null {
  for (const root of [grillsDir(), lessonsDir()]) {
    const dir = path.join(root, slug);
    if (existsSync(dir)) return dir;
  }
  return null;
}
