"use client";

import * as React from "react";
import type { Language } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fenceLanguage } from "@/lib/code-fence";
import { highlightStyle, loadFenceLanguage, mountHighlightStyle } from "./syntax";
import styles from "./prose.module.css";

function highlight(code: string, language: Language): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pos = 0;
  highlightTree(language.parser.parse(code), highlightStyle, (from, to, classes) => {
    if (from > pos) out.push(code.slice(pos, from));
    out.push(<span key={from} className={classes}>{code.slice(from, to)}</span>);
    pos = to;
  });
  if (pos < code.length) out.push(code.slice(pos));
  return out;
}

/** A fenced code block: plain on first paint, then highlighted in the editor's colours once its language loads. */
export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  // Keyed by its source, so a stale highlight never shows over newer code.
  const [lit, setLit] = React.useState<{ code: string; nodes: React.ReactNode[] } | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const word = fenceLanguage(lang);
    if (!word) return;
    let cancelled = false;
    void loadFenceLanguage(word).then((support) => {
      if (cancelled || !support) return;
      mountHighlightStyle();
      setLit({ code, nodes: highlight(code, support.language) });
    });
    return () => {
      cancelled = true;
    };
  }, [lang, code]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => void navigator.clipboard.writeText(code).then(() => setCopied(true));

  return (
    <div className={styles.codeBlock}>
      <pre>
        <code>{lit?.code === code ? lit.nodes : code}</code>
      </pre>
      <div className={styles.codeActions}>
        {lang && <span className={styles.codeLang}>{lang}</span>}
        <Button variant="ghost" size="icon-sm" title={copied ? "Copied" : "Copy"} aria-label={copied ? "Copied" : "Copy"} onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </div>
    </div>
  );
}
