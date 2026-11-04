/**
 * An answer format: a kind of Work file, picked by extension, with its own editor and,
 * optionally, a text summary Claude reads instead of the file. The CLI imports this tree,
 * so it stays erasable TS with relative `.ts` imports and no React.
 */
export type Warnings = { unattached: number; loose: number; unreadable: number };

export type Summary = { text: string; warnings: Warnings };

export type AnswerFormat = {
  id: string;
  label: string;
  extensions: string[];
  /** A lucide icon name; the site maps it to a component. */
  icon: string;
  /** The body of a new file. */
  template?: () => string;
  /** `name` heads the summary (the file's path as the reader knows it). */
  summarize?: (text: string, name: string) => Summary;
  /** The summary lines about one element, for asking about it. */
  focus?: (text: string, elementId: string) => string[];
  /** A file body from a spec in the summary's own grammar. */
  write?: (spec: string) => string;
};
