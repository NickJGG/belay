"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { highlightFileLines, type Run } from "@/components/content/syntax";
import { cn } from "@/lib/utils";
import { expandRange, hunkSpan, CONTEXT_STEP, type Hunk, type HunkLine } from "../_lib/view";
import styles from "./review.module.css";

const KIND_CLASS = { "+": styles.add, "-": styles.del, " ": undefined } as const;

/**
 * A finding's saved hunk in GitHub's diff colours, highlighted for its file's language once that loads, with the
 * flagged line marked in the gutter. Show 20 lines above/below reads the file as it is now; the saved hunk stays as
 * it was reviewed.
 */
export function HunkView({ id, n, hunk }: { id: string; n: number; hunk: Hunk }) {
  const [above, setAbove] = React.useState<HunkLine[]>([]);
  const [below, setBelow] = React.useState<HunkLine[]>([]);
  const [end, setEnd] = React.useState(false);
  const lines = React.useMemo(() => [...above, ...hunk.lines, ...below], [above, hunk.lines, below]);
  // Keyed by the lines it was made for, so a stale highlight never shows over newer lines.
  const [lit, setLit] = React.useState<{ for: HunkLine[]; runs: Run[][] } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void highlightFileLines(
      hunk.file,
      lines.map((l) => l.text),
    ).then((runs) => {
      if (!cancelled && runs) setLit({ for: lines, runs });
    });
    return () => {
      cancelled = true;
    };
  }, [hunk.file, lines]);
  const runs = lit?.for === lines ? lit.runs : null;
  const span = hunkSpan(lines);
  const up = span && expandRange(span, "above");

  const expand = async (dir: "above" | "below") => {
    const range = span && expandRange(span, dir);
    if (!range) return;
    const r = await fetch(`/r/${encodeURIComponent(id)}/lines?n=${n}&from=${range.from}&to=${range.to}`, { cache: "no-store" });
    if (!r.ok) return;
    const got = ((await r.json()) as { lines: { line: number; text: string }[] }).lines.map((l): HunkLine => ({ kind: " ", line: l.line, text: l.text }));
    if (dir === "above") setAbove((a) => [...got, ...a]);
    else {
      setBelow((b) => [...b, ...got]);
      if (got.length < CONTEXT_STEP) setEnd(true);
    }
  };

  return (
    <div className={styles.code}>
      <div className={styles.codeHead}>
        <code>{hunk.file}</code>
        {hunk.context ? <span> · {hunk.context}</span> : null}
      </div>
      <div className={styles.lines}>
        {up ? (
          <button type="button" className={styles.more} onClick={() => void expand("above")}>
            <span className={styles.moreIco}>
              <ChevronUp size={12} aria-hidden />
            </span>
            <span>Show {up.to - up.from + 1} lines above</span>
          </button>
        ) : null}
        {lines.map((l, i) => (
          <div key={`${i}:${l.kind}:${l.line}`} className={cn(styles.cl, KIND_CLASS[l.kind], l.kind !== "-" && l.line === hunk.line && styles.hit)}>
            <span className={styles.ln}>{l.line ?? ""}</span>
            <span className={styles.sign}>{l.kind === " " ? "" : l.kind}</span>
            <span className={styles.src}>{runs ? runs[i].map((r, k) => (typeof r === "string" ? r : <span key={k} className={r.cls}>{r.text}</span>)) : l.text}</span>
          </div>
        ))}
        {span && !end ? (
          <button type="button" className={styles.more} onClick={() => void expand("below")}>
            <span className={styles.moreIco}>
              <ChevronDown size={12} aria-hidden />
            </span>
            <span>Show {CONTEXT_STEP} lines below</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
