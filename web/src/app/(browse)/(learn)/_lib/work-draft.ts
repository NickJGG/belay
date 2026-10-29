/**
 * The Work editor's unsaved text, kept in sessionStorage per course and file, so a save that fails (the server gone,
 * learn switched off) doesn't lose it. A draft records the hash of the file it was typed over and comes back only
 * while the file on disk still has that hash.
 */

export const draftKey = (course: string, path: string) => `belay:draft:${course}:${path}`;

/** FNV-1a, 32-bit: only ever compared with itself. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The stored form of `text` typed over the file's `base` text; null when there's nothing unsaved to keep. */
export function encodeDraft(text: string, base: string): string | null {
  return text === base ? null : JSON.stringify({ text, base: contentHash(base) });
}

/** The draft's text, if it was typed over exactly `disk` and differs from it. */
export function restoreDraft(raw: string | null, disk: string): string | null {
  try {
    const d: unknown = JSON.parse(raw ?? "");
    if (typeof d !== "object" || d === null) return null;
    const { text, base } = d as Record<string, unknown>;
    return typeof text === "string" && text !== disk && base === contentHash(disk) ? text : null;
  } catch {
    return null;
  }
}

/** `PUT /api/work`'s JSON body (`writeWork`'s result); null when there was no JSON. */
export type SaveResponse = { ok: true; mtime: number } | { ok: false; error: string; text?: string; mtime?: number } | null;

export type SaveOutcome =
  | { kind: "saved"; mtime: number }
  | { kind: "changed"; text: string; mtime: number }
  | { kind: "deleted" }
  | { kind: "error"; error: string };

export const WORK_OFF = "Not saved: the site isn't serving Work (is learn switched off?). Your text is kept in this tab.";

/** What a save's response means. `status` is null when the request failed outright. */
export function saveOutcome(status: number | null, data: SaveResponse): SaveOutcome {
  if (data?.ok) return { kind: "saved", mtime: data.mtime };
  if (status === 409 && data?.text !== undefined) return { kind: "changed", text: data.text, mtime: data.mtime! };
  // Only the route's own 404 is JSON; the proxy's plain one means the route itself is off.
  if (status === 404) return data ? { kind: "deleted" } : { kind: "error", error: WORK_OFF };
  return { kind: "error", error: data ? data.error : "The site server didn't answer." };
}
