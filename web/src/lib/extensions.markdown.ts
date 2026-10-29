/**
 * The site's built-in Markdown handlers: each extension's syntax, from its `(browse)/(<id>)/_lib/markdown.ts`. Runs on
 * both sides, as `markdown.ts` does. A page names the handler by its context's `id`.
 */
import { markdown as learn, type LearnMarkdown } from "@/app/(browse)/(learn)/_lib/markdown";
import type { MarkdownHandler } from "./markdown";

export type MarkdownContext = LearnMarkdown;

export const MARKDOWN_HANDLERS: { [K in MarkdownContext["id"]]: MarkdownHandler<Extract<MarkdownContext, { id: K }>> } = { learn };
