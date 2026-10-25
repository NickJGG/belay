"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import styles from "./prose.module.css";

/** A Mermaid chart drawn in the page's tokens; redrawn when the theme flips. */
export function Mermaid({ chart }: { chart: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const id = `mermaid-${React.useId().replace(/[^a-z0-9]/gi, "")}`;
  const { resolvedTheme } = useTheme();
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        themeVariables: {
          darkMode: resolvedTheme === "dark",
          background: v("--bg"),
          primaryColor: v("--panel"),
          primaryTextColor: v("--text"),
          primaryBorderColor: v("--line-strong"),
          secondaryColor: v("--panel-hover"),
          tertiaryColor: v("--bg"),
          lineColor: v("--muted"),
          textColor: v("--text"),
          clusterBkg: v("--bg"),
          clusterBorder: v("--line-strong"),
          fontFamily: v("--font-sans"),
          fontSize: "14px",
        },
      });
      const ok = v("--ok");
      const statusDefs = [
        `classDef course-done fill:${ok}33,stroke:${ok},color:${v("--text")}`,
        `classDef course-in-progress stroke:${ok},stroke-width:2px`,
      ].join("\n");
      const text = /^\s*(graph|flowchart)\b/.test(chart) && chart.includes(" course-")
        ? `${chart}\n${statusDefs}\n`
        : chart;
      try {
        const { svg, bindFunctions } = await mermaid.render(id, text);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        bindFunctions?.(ref.current);
        setFailed(false);
      } catch {
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  if (failed) return <pre className={styles.mermaidError}>{chart}</pre>;
  return <div ref={ref} className={styles.mermaid} aria-label="Diagram" role="img" />;
}
