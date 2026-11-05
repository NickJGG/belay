import type { AnswerFormat, Warnings } from "../../answer-formats/index.ts";

/** The bridge's cap on a message's text (`bridge/protocol.mts` `Note`). */
export const MAX_NOTE = 4000;

/**
 * The text an attempt carries: the format's summary when it has one, so Claude never reads the
 * raw file. A summary too long for one message is never cut; it points at `belay work read`.
 */
export function attemptText(format: AnswerFormat, text: string, rel: string, abs: string): string {
  const plain = `Attempt: ${rel}`;
  if (!format.summarize) return plain;
  let summary: string;
  try {
    summary = format.summarize(text, rel).text;
  } catch {
    return plain;
  }
  if (summary.length <= MAX_NOTE) return summary;
  return `${summary.split("\n", 1)[0]}\nToo long for the message: run \`belay work read "${abs}"\`.`;
}

/** The bar's warnings chip, e.g. `2 unattached · 1 loose note`; null when there's nothing to warn about. */
export function warningsLabel(w: Warnings): string | null {
  const parts = [
    w.unattached ? `${w.unattached} unattached` : "",
    w.loose ? `${w.loose} loose ${w.loose === 1 ? "note" : "notes"}` : "",
    w.unreadable ? `${w.unreadable} unreadable` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
