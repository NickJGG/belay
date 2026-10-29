import { memo } from "react";
import { renderMarkdown, type MarkdownContext } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import styles from "./prose.module.css";

/**
 * Rendered Markdown in the prose styles; `context` adds an extension's syntax (a course's claim and source chips),
 * `compact` is for chat bubbles and list rows, `wide` drops the 68ch measure for diagrams. Memoized: parsing is costly
 * and the drawer re-renders on every keystroke.
 */
export const Prose = memo(function Prose({
  markdown,
  context,
  compact = false,
  wide = false,
  className,
}: {
  markdown: string;
  context?: MarkdownContext;
  compact?: boolean;
  wide?: boolean;
  className?: string;
}) {
  return <div className={cn(styles.prose, compact && styles.compact, wide && styles.wide, className)}>{renderMarkdown(markdown, context)}</div>;
});
