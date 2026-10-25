const NOTE_PAGES: Record<string, string> = {
  syllabus: "",
  map: "/map",
  misconceptions: "/misconceptions",
  cards: "/cards",
  now: "/now",
};

/** Obsidian resolves bare names by note; in a course a bare name is a knowledge note. */
export function resolveWikiTarget(course: string, target: string): string {
  const [file, anchor] = target.split("#");
  const block = anchor?.match(/^\^(c\d+)$/)?.[1];
  const hash = block ? `#${block}` : "";
  const base = `/courses/${course}`;
  const name = file.replace(/\.md$/, "");
  if (!name) return hash;
  const [dir, ...rest] = name.split("/");
  const slug = rest.join("/");
  if (dir === "sources" && slug) return `${base}/sources/${slug}${hash}`;
  if (dir === "lessons" && slug) return `${base}/lessons/${slug}${hash}`;
  if (dir === "knowledge" && slug) return `${base}/knowledge/${slug}${hash}`;
  if (!slug && name in NOTE_PAGES) return `${base}${NOTE_PAGES[name]}${hash}`;
  return `${base}/knowledge/${name}${hash}`;
}
