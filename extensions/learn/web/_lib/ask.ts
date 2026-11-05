/** A shape's name for the ask button: its summary line without the bracketed remark at its end. */
export function askLabel(line: string): string {
  return line.replace(/\s+\([^()]*\)$/, "").trim() || line;
}

/** The chat message asking about one shape: the question, then that shape's summary lines. */
export function askMessage(question: string, label: string, rel: string, lines: string[]): string {
  return `${question.trim()}\n\nAbout ${label} in ${rel}:\n${lines.map((l) => `  ${l}`).join("\n")}`;
}
