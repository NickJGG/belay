import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { dataDir, runDir } from "../../../src/config.ts";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import { activeKinds } from "./extensions.server.ts";

export { runDir };

/** A session's folder and kind: the first active kind's folder (grills before lessons) with the slug; null when none has it. */
export function sessionOwner(slug: string): { id: ExtensionId; dir: string } | null {
  const data = dataDir();
  for (const kind of activeKinds(data)) {
    const dir = path.join(kind.root(data), slug);
    if (existsSync(dir)) return { id: kind.id, dir };
  }
  return null;
}

export const sessionDir = (slug: string): string | null => sessionOwner(slug)?.dir ?? null;
