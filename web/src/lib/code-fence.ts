/** Fenced code blocks in rendered Markdown. Imports nothing, so client components can use it. */

// Fence words that mean "no language". Fuzzy name matching would otherwise read `text` as LaTeX.
const PLAIN = new Set(["text", "txt", "plain", "plaintext", "output", "console", "none", "stdout"]);

/** A fence's language word, lowercased, or null when it names none to highlight. */
export function fenceLanguage(lang: string | null | undefined): string | null {
  const word = lang?.trim().toLowerCase() ?? "";
  return word && !PLAIN.has(word) ? word : null;
}

/** The mdast node a fenced `code` node becomes: a `code-block` element, drawn by the `CodeBlock` component. */
export function codeBlockNode(code: { lang?: string | null; value: string }) {
  return {
    type: "codeBlock",
    data: { hName: "code-block", hProperties: { lang: code.lang ?? "", code: code.value }, hChildren: [] },
  };
}
