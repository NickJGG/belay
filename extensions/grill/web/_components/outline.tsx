"use client";

import * as React from "react";
import Link from "next/link";
import { History, LayoutTemplate } from "lucide-react";
import { Mark } from "@/components/layout/logo";
import { RailFoot } from "@/components/layout/rail";
import { SidePane } from "@/components/layout/side-pane";
import { tip } from "@/components/layout/side-tip";
import { useNav } from "@/components/layout/site-nav";
import { families, statusChip, type Opt, type Question, type SessionDoc } from "../_lib/session-doc";
import { cn } from "@/lib/utils";
import styles from "./workspace.module.css";

const RAIL_MARK: Record<string, string> = { resolved: "done", open: "open", deferred: "muted", dropped: "muted", see: "muted" };

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
  const nav = useNav();
  return (
    <SidePane open={open} label="Outline" className={cn(!open && styles.outlineShut)} foot={<RailFoot open={open} onToggle={onToggle} label="the outline ( | )" />}>
      <nav className={styles.olNav} aria-label="Primary">
        <Link href="/" className={cn(styles.olRow, styles.olKey)} aria-label="Belay home">
          <Mark className={styles.olMark} />
        </Link>
        {open
          ? nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={cn(styles.olRow, styles.olKey)} aria-label={item.label} data-tip={item.label} data-tip-below="">
                  <Icon size={16} aria-hidden />
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
    </SidePane>
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
          {view("#current", <LayoutTemplate size={16} aria-hidden />, "Current design")}
          {doc.mock.page === "existing" ? view("#today", <History size={16} aria-hidden />, "Today") : null}
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
