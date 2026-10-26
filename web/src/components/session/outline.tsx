"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight, History, LayoutTemplate } from "lucide-react";
import { Mark } from "@/components/layout/logo";
import { NAV } from "@/components/layout/site-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { families, statusChip, type Opt, type Question, type SessionDoc } from "@/lib/session-doc";
import { cn } from "@/lib/utils";
import styles from "./session.module.css";

const RAIL_MARK: Record<string, string> = { resolved: "done", open: "open", deferred: "muted", dropped: "muted", see: "muted" };

/** Expanded, a row's label is the native title; collapsed, it's `data-tip`, which `useTip` shows at once. */
const tip = (open: boolean, text: string) => (open ? { title: text } : { "data-tip": text });

/** The hover label of the hovered or focused `[data-tip]` row, portalled past the pane's overflow: right of the pane, or under a `data-tip-below` row. */
function useTip() {
  const ref = React.useRef<HTMLElement>(null);
  const [at, setAt] = React.useState<{ text: string; top: number; left: number; below: boolean } | null>(null);
  React.useEffect(() => {
    const pane = ref.current;
    if (!pane) return;
    const show = (e: Event) => {
      const row = (e.target as Element).closest<HTMLElement>("[data-tip]");
      if (!row || !pane.contains(row)) return setAt(null);
      const r = row.getBoundingClientRect();
      const below = row.dataset.tipBelow !== undefined;
      setAt(
        below
          ? { text: row.dataset.tip ?? "", top: r.bottom + 6, left: r.left + r.width / 2, below }
          : { text: row.dataset.tip ?? "", top: r.top + r.height / 2, left: pane.getBoundingClientRect().right + 8, below },
      );
    };
    const hide = () => setAt(null);
    pane.addEventListener("pointerover", show);
    pane.addEventListener("pointerleave", hide);
    pane.addEventListener("focusin", show);
    pane.addEventListener("focusout", hide);
    pane.addEventListener("click", hide);
    pane.addEventListener("scroll", hide, true);
    return () => {
      pane.removeEventListener("pointerover", show);
      pane.removeEventListener("pointerleave", hide);
      pane.removeEventListener("focusin", show);
      pane.removeEventListener("focusout", hide);
      pane.removeEventListener("click", hide);
      pane.removeEventListener("scroll", hide, true);
      setAt(null);
    };
  }, []);
  const node = at
    ? createPortal(
        <span role="tooltip" className={cn(styles.olTip, at.below && styles.olTipBelow)} style={{ top: at.top, left: at.left }}>
          {at.text}
        </span>,
        document.body,
      )
    : null;
  return [ref, node] as const;
}

type Props = {
  doc: SessionDoc;
  /** The open view's hash (`#current`, `#today`, `#q-<n>`). */
  here: string;
  /** The selected question's shown option. */
  opt: string;
  onOpt: (key: string) => void;
  /** A question Claude just showed. */
  pulse: number | null;
  open: boolean;
  onToggle: () => void;
};

/**
 * A grill's left pane in place of the sidebar (>=768px): the app nav, the topic, Current design and Today, then the
 * questions with the selected one's options beneath. Every row keeps its key (mark, icon, number, letter) in one
 * column; expanding only adds labels to its right, so nothing moves.
 */
export function Outline({ doc, here, opt, onOpt, pulse, open, onToggle }: Props) {
  const decided = doc.questions.filter((q) => q.status === "resolved").length;
  const [paneRef, tipNode] = useTip();
  return (
    <aside ref={paneRef} className={cn(styles.outline, !open && styles.outlineShut)} aria-label="Outline">
      <nav className={styles.olNav} aria-label="Primary">
        <Link href="/" className={cn(styles.olRow, styles.olKey)} aria-label="Belay home">
          <Mark className={styles.olMark} />
        </Link>
        {open
          ? NAV.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={cn(styles.olRow, styles.olKey)} aria-label={item.label} data-tip={item.label} data-tip-below="">
                  <Icon size={15} aria-hidden />
                </Link>
              );
            })
          : null}
      </nav>
      <span className={styles.olRule} />
      <div className={cn(styles.olRow, styles.olHead)} {...tip(open, `${doc.topic} · ${decided} of ${doc.questions.length} decided`)}>
        <span className={cn(styles.olKey, styles.olCount)}>
          {decided}/{doc.questions.length}
        </span>
        {open ? <b className={styles.olText}>{doc.topic}</b> : null}
      </div>
      <div className={styles.olScroll}>
        <Rows doc={doc} here={here} opt={opt} onOpt={onOpt} pulse={pulse} open={open} />
      </div>
      <div className={styles.olFoot}>
        <button
          type="button"
          className={styles.olRow}
          onClick={onToggle}
          {...tip(open, open ? "Collapse the outline ( | )" : "Expand the outline ( | )")}
          aria-label={open ? undefined : "Expand the outline"}
        >
          <span className={styles.olKey}>{open ? <ChevronsLeft size={15} aria-hidden /> : <ChevronsRight size={15} aria-hidden />}</span>
          {open ? <span className={styles.olText}>Collapse</span> : null}
        </button>
        {open ? <ThemeToggle /> : null}
      </div>
      {tipNode}
    </aside>
  );
}

type RowsProps = Pick<Props, "doc" | "here" | "opt" | "onOpt" | "pulse" | "open">;

/** Current design and Today (with a mock), then the questions with the selected one's options. */
function Rows({ doc, here, opt, onOpt, pulse, open }: RowsProps) {
  const view = (hash: string, icon: React.ReactNode, label: string) => (
    <a href={hash} className={cn(styles.olRow, here === hash && styles.olOn)} {...tip(open, label)} aria-label={open ? undefined : label}>
      <span className={styles.olKey}>{icon}</span>
      {open ? <span className={styles.olText}>{label}</span> : null}
    </a>
  );
  return (
    <>
      {doc.mock ? (
        <>
          {view("#current", <LayoutTemplate size={14} aria-hidden />, "Current design")}
          {doc.mock.page === "existing" ? view("#today", <History size={14} aria-hidden />, "Today") : null}
          <span className={styles.olRule} />
        </>
      ) : null}
      {doc.questions.map((q) => {
        const on = here === `#q-${q.n}`;
        const chip = statusChip(q);
        return (
          <div key={q.n} className={styles.olGroup}>
            <a
              href={`#q-${q.n}`}
              className={cn(styles.olRow, on && styles.olOn, pulse === q.n && styles.olPulse)}
              {...tip(open, `Q${q.n} · ${q.short ?? q.title} (${q.status})`)}
              aria-current={on ? "true" : undefined}
            >
              <span className={styles.olKey}>
                <span className={cn(styles.olQn, styles[`rq-${RAIL_MARK[q.status]}`])}>{q.n}</span>
              </span>
              {open ? (
                <>
                  <span className={styles.olText}>{q.short ?? q.title}</span>
                  <span className={cn(styles.olChip, styles[`olChip-${chip.tone}`])}>{chip.tone === "picked" && q.pick ? `✓ ${q.pick}` : chip.text}</span>
                </>
              ) : null}
            </a>
            {on && q.opts?.length ? (
              <div className={styles.olNest}>
                {families(q).map(({ root, kids }) => (
                  <React.Fragment key={root.key}>
                    <OptRow q={q} o={root} on={root.key === opt} onOpt={onOpt} open={open} />
                    {kids.length ? (
                      <div className={styles.olKids}>
                        {kids.map((k) => (
                          <OptRow key={k.key} q={q} o={k} on={k.key === opt} onOpt={onOpt} open={open} />
                        ))}
                      </div>
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** The Outline's rows for the phone's "Qn of N" sheet, where the pane isn't shown. */
export function OutlineList(props: Omit<RowsProps, "open">) {
  return (
    <div className={styles.olSheet}>
      <Rows {...props} open />
    </div>
  );
}

function OptRow({ q, o, on, onOpt, open }: { q: Question; o: Opt; on: boolean; onOpt: (key: string) => void; open: boolean }) {
  return (
    <button
      type="button"
      className={cn(styles.olRow, styles.olOpt, on && styles.olOn, o.out && styles.olOut)}
      onClick={() => onOpt(o.key)}
      aria-pressed={on}
      {...tip(open, `${o.key} · ${o.name}${o.key === q.rec ? " (recommended)" : ""}`)}
    >
      <span className={styles.olKey}>{o.key}</span>
      {open ? (
        <span className={styles.olText}>
          <span className={styles.olName}>{o.name}</span>
          {o.key === q.rec ? <span className={styles.olRecPill}>rec</span> : null}
        </span>
      ) : null}
    </button>
  );
}
