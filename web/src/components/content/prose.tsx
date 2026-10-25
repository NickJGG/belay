import { memo } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import styles from "./prose.module.css";

/** Rendered Markdown in topo's prose styles; `compact` for chat bubbles. Memoized: parsing is costly and the drawer re-renders on every keystroke. */
export const Prose = memo(function Prose({ markdown, compact = false, className }: { markdown: string; compact?: boolean; className?: string }) {
  return <div className={cn(styles.prose, compact && styles.compact, className)}>{renderMarkdown(markdown)}</div>;
});
