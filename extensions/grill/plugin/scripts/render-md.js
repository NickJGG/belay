#!/usr/bin/env node
/* Renders <session dir>/session.json into <slug>.md, grill's markdown format, which belay reads.
   Usage: `node render-md.js <session dir>`. Prints `ok`, or the problems in session.json (and writes nothing). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSession, validate } from "./session.js";

// Belay parses plain `key: value` lines itself and hands anything else to YAML, so quote what YAML would misread.
const yamlValue = (v) =>
  !/^\d{4}-\d\d-\d\d$/.test(v) && /: |:$|^[\s"'&*!|>%@`#,[\]{}?-]|\s$|^(true|false|null|~|yes|no|on|off|[\d.+-]+)$/i.test(v)
    ? JSON.stringify(v)
    : v;

const indent = (text) => text.trim().split(/\r?\n/).join("\n  ");

export function renderMd(s) {
  const front = ["slug", "topic", "status", "project", "started", "updated"]
    .filter((k) => s[k] != null)
    .map((k) => `${k}: ${yamlValue(String(s[k]).replace(/\s*\n\s*/g, " "))}`);
  const resolved = s.questions
    .filter((q) => q.status !== "open")
    .map((q) => {
      const opts = (q.opts ?? []).filter((o) => !o.from).map((o) => `${o.key} ${o.name}`);
      const title = opts.length ? `${q.title} (${opts.join(" · ")})` : q.title;
      const answer = q.mock ? `${q.answer.trim()} Previewed (Q${q.n}).` : q.answer;
      return `- **Q:** ${indent(title)}\n  **A:** ${indent(answer)}`;
    });
  return [
    `---\n${front.join("\n")}\n---`,
    `# Grill session: ${s.slug}`,
    `## Topic\n${(s.about || s.topic).trim()}`,
    `## Resolved${resolved.length ? `\n\n${resolved.join("\n\n")}` : ""}`,
    `## Open\n${s.open.trim()}`,
  ].join("\n\n") + "\n";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.log("usage: node render-md.js <session dir>");
    process.exit(2);
  }
  let s, problems;
  try {
    s = readSession(dir);
    problems = validate(s, path.resolve(dir));
  } catch (err) {
    problems = [err.message];
  }
  if (problems.length) {
    console.log(problems.join("\n"));
    process.exit(1);
  }
  fs.writeFileSync(path.join(dir, `${s.slug}.md`), renderMd(s));
  console.log("ok");
}
