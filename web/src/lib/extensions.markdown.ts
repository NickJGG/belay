/**
 * The site's Markdown handlers: each installed extension's syntax, from its `_lib/markdown.ts` (listed by the generated
 * `extensions.markdown.generated.ts`). Runs on both sides, as `markdown.ts` does. A page names the handler by its
 * context's `id`; an uninstalled extension's has none.
 */
import { HANDLERS } from "./extensions.markdown.generated.ts";
import type { MarkdownHandler } from "./markdown";

/** Names the extension whose handler reads it; the rest is that extension's own. */
export type MarkdownContext = { id: string; [key: string]: unknown };

export const MARKDOWN_HANDLERS: Partial<Record<string, MarkdownHandler<MarkdownContext>>> = HANDLERS;
