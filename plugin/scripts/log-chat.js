#!/usr/bin/env node
/* Appends a terminal-side message to a session's chat.jsonl; the bridge logs the site side itself.
   Usage: `node log-chat.js <slug> terminal|claude` with the message text on stdin.
   `terminal` is the user typing in the terminal; `claude` is my message there. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [slug, who] = process.argv.slice(2);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? "") || !["terminal", "claude"].includes(who)) {
  console.log("usage: node log-chat.js <slug> terminal|claude  (text on stdin)");
  process.exit(2);
}
const text = fs.readFileSync(0, "utf8").trim();
if (!text) {
  console.log("no text on stdin");
  process.exit(2);
}
const dir = path.join(process.env.SEAR_SESSIONS_DIR ?? path.join(os.homedir(), "Sear", "sessions"), slug);
fs.mkdirSync(dir, { recursive: true });
const entry = who === "terminal" ? { from: "terminal", kind: "chat", text } : { from: "claude", kind: "terminal", text };
fs.appendFileSync(path.join(dir, "chat.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
