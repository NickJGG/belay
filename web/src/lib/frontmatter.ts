import { closeSync, openSync, readSync } from "node:fs";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/;
const LINE = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/;

/**
 * The scalar `key: value` lines of a markdown file's frontmatter, as strings; nested and list values are
 * skipped. Grill sessions and belay projects only need their flat fields, so this stands in for a YAML parser.
 */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = FRONTMATTER.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = LINE.exec(line);
    const raw = kv?.[2]?.trim();
    if (!kv || !raw) continue;
    data[kv[1]] = scalar(raw);
  }
  return { data, body: text.slice(m[0].length) };
}

/** The items of a top-level block list (`key:` then `  - item` lines) in the frontmatter; [] when absent. */
export function frontmatterList(text: string, key: string): string[] {
  const m = FRONTMATTER.exec(text);
  if (!m) return [];
  const lines = m[1].split(/\r?\n/);
  const at = lines.findIndex((l) => {
    const kv = LINE.exec(l);
    return kv?.[1] === key && !kv[2]?.trim();
  });
  if (at < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^[ \t]+-[ \t]+(.*)$/.exec(line)?.[1]?.trim();
    if (item == null) break;
    items.push(scalar(item));
  }
  return items;
}

function scalar(raw: string): string {
  if (raw.startsWith('"')) {
    try {
      return String(JSON.parse(raw));
    } catch {
      return raw.slice(1, raw.endsWith('"') ? -1 : undefined);
    }
  }
  if (raw.startsWith("'")) return raw.slice(1, raw.endsWith("'") ? -1 : undefined).replaceAll("''", "'");
  return raw.replace(/\s+#.*$/, "");
}

const CHUNK = 4096;

/** The file up to the end of its frontmatter (whole file without one), so long session bodies aren't read. */
export function readHead(path: string): string {
  const fd = openSync(path, "r");
  try {
    let buf = Buffer.alloc(0);
    for (;;) {
      const chunk = Buffer.alloc(CHUNK);
      const n = readSync(fd, chunk, 0, CHUNK, null);
      if (n === 0) return buf.toString("utf8");
      buf = Buffer.concat([buf, chunk.subarray(0, n)]);
      // latin1 maps bytes 1:1, so the match length is a byte offset; a match ending at `$` might continue in the next chunk
      const m = FRONTMATTER.exec(buf.toString("latin1"));
      if (m?.[0].endsWith("\n")) return buf.toString("utf8", 0, m[0].length);
    }
  } finally {
    closeSync(fd);
  }
}
