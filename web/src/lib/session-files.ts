/** Reading a session folder's chat.jsonl for the server; the parsing is shared with the browser. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChat, type ChatEntry } from "./chat.ts";

export function readChat(dir: string): ChatEntry[] {
  try {
    return parseChat(readFileSync(join(dir, "chat.jsonl"), "utf8"));
  } catch {
    return [];
  }
}
