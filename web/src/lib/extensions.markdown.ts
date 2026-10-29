/**
 * The site's Markdown handlers: each installed extension's syntax, from its `_lib/markdown.ts` (listed by the generated
 * `extensions.markdown.generated.ts`). Runs on both sides, as `markdown.ts` does. A page names the handler by its
 * context's `id`; an uninstalled extension's has none.
 */
import type { LearnMarkdown } from "@/app/(browse)/(learn)/_lib/markdown";
import { HANDLERS } from "./extensions.markdown.generated.ts";
import type { MarkdownHandler } from "./markdown";

export type MarkdownContext = LearnMarkdown;

export const MARKDOWN_HANDLERS: Partial<{ [K in MarkdownContext["id"]]: MarkdownHandler<Extract<MarkdownContext, { id: K }>> }> = HANDLERS;
