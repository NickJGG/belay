import { memo } from "react";
import { renderMarkdown, type MarkdownContext } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import styles from "./prose.module.css";

/**
 * Rendered Markdown in topo's prose styles; `course` adds its Obsidian syntax (claim and source chips, `^cN` anchors),
 * `compact` is for chat bubbles and list rows, `wide` drops the 68ch measure for diagrams. Memoized: parsing is costly
 * and the drawer re-renders on every keystroke.
 */
export const Prose = memo(function Prose({
  markdown,
  course,
  compact = false,
  wide = false,
  className,
}: {
  markdown: string;
  course?: MarkdownContext;
  compact?: boolean;
  wide?: boolean;
  className?: string;
}) {
  return <div className={cn(styles.prose, compact && styles.compact, wide && styles.wide, className)}>{renderMarkdown(markdown, course)}</div>;
});
