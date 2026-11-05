import { ANSWER_FORMATS, iconFor } from "../../answer-formats/index.ts";

/** An entry in the Work tab's + New menu. */
export type NewKind = { label: string; ext: string; icon: string; body: () => string };

const empty = () => "";

/** Answer formats with a template, then the text kinds the default format covers. */
export const NEW_KINDS: readonly NewKind[] = [
  ...ANSWER_FORMATS.filter((f) => f.template).map((f) => ({ label: f.label, ext: f.extensions[0], icon: f.icon, body: f.template! })),
  ...[
    ["Markdown", ".md"],
    ["Text", ".txt"],
    ["Python", ".py"],
  ].map(([label, ext]) => ({ label, ext, icon: iconFor(ext), body: empty })),
];

/** `work/…` for a typed name (folders allowed), with `ext` added unless it's there already; null when there's no file name. */
export function newFilePath(name: string, ext = ""): string | null {
  const clean = name.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/^work\//, "");
  if (!clean || clean.endsWith("/")) return null;
  return `work/${ext && !clean.toLowerCase().endsWith(ext) ? clean + ext : clean}`;
}
