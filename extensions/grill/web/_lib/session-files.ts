/** Reading a grill's session.json for the server; the parsing is shared with the browser. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Question, SessionDoc } from "./session-doc.ts";

/** session.json, or null when it's missing or doesn't parse. Only shape-checked enough to render. */
export function readSessionDoc(dir: string): SessionDoc | null {
  try {
    const j = JSON.parse(readFileSync(join(dir, "session.json"), "utf8"));
    if (!j || typeof j !== "object" || !Array.isArray(j.questions)) return null;
    j.questions = j.questions.filter((q: unknown) => typeof (q as Question)?.n === "number");
    for (const q of j.questions as Question[]) if (!Array.isArray(q.opts)) q.opts = [];
    if (j.mock !== null && typeof j.mock !== "object") j.mock = null;
    return j as SessionDoc;
  } catch {
    return null;
  }
}
