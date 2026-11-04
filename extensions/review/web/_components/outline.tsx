"use client";

import Link from "next/link";
import { StatusIcon } from "@/components/belay/status-icon";
import belay from "@/components/belay/belay.module.css";
import { Mark } from "@/components/layout/logo";
import { RailFoot } from "@/components/layout/rail";
import { SidePane } from "@/components/layout/side-pane";
import { tip } from "@/components/layout/side-tip";
import { useNav } from "@/components/layout/site-nav";
import { cn } from "@/lib/utils";
import type { Checking, Decisions, Finding } from "../../cli/state.ts";
import { checkingSplit, decisionChip, groups, severityTone, type Tone, type View } from "../_lib/view";
import { ReviewIcon } from "./mark";
import styles from "./review.module.css";

export const TONE_DOT: Record<Tone, string> = { bad: styles.dotBad, warn: styles.dotWarn, quiet: styles.dotQuiet };

type Props = {
  title: string;
  running: boolean;
  findings: Finding[];
  decisions: Decisions;
  checking: Checking[];
  view: View;
  open: boolean;
  onToggle: () => void;
};

/**
 * A review's left pane in place of the sidebar (>=768px): the app nav, the review (its Overview), then its findings
 * under their groups with their decision chips. While it runs: what's confirmed so far, then what's being checked.
 */
export function Outline({ title, running, findings, decisions, checking, view, open, onToggle }: Props) {
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
      <a href="#overview" className={cn(styles.olRow, view.kind === "overview" && styles.olOn)} {...tip(open, `${title} · Overview`)} aria-label={open ? undefined : `${title} · Overview`}>
        <span className={styles.olKey}>{running ? <DoingIcon size={16} /> : <ReviewIcon size={16} aria-hidden />}</span>
        {open ? <b className={cn(styles.olText, styles.olTopic)}>{title}</b> : null}
      </a>
      <div className={styles.olScroll}>
        {running ? <Running checking={checking} open={open} /> : <Findings findings={findings} decisions={decisions} view={view} open={open} />}
      </div>
    </SidePane>
  );
}

export function DoingIcon({ size = 14 }: { size?: number }) {
  return (
    <span className={styles.doingIcon}>
      <StatusIcon status="doing" size={size} label="Running" />
    </span>
  );
}

function Findings({ findings, decisions, view, open }: Pick<Props, "findings" | "decisions" | "view" | "open">) {
  return groups(findings).map((g) => (
    <div key={g.label} className={styles.olGroup}>
      <div className={styles.olHead}>{g.label}</div>
      {g.findings.map((f) => {
        const chip = decisionChip(decisions[f.n]);
        const on = view.kind === "finding" && view.n === f.n;
        return (
          <a
            key={f.n}
            href={`#f-${f.n}`}
            className={cn(styles.olRow, on && styles.olOn)}
            aria-current={on ? "true" : undefined}
            {...tip(open, `#${f.n} · ${f.title}${chip ? ` (${chip.text})` : ""}`)}
          >
            <span className={styles.olKey}>
              <span className={cn(belay.dot, TONE_DOT[severityTone(f)])} aria-hidden />
            </span>
            {open ? (
              <>
                <span className={styles.olText}>{f.title}</span>
                {chip ? <span className={cn(styles.olChip, styles[`olChip-${chip.tone}`])}>{chip.text}</span> : null}
              </>
            ) : null}
          </a>
        );
      })}
    </div>
  ));
}

function Running({ checking, open }: { checking: Checking[]; open: boolean }) {
  const { confirmed, pending } = checkingSplit(checking);
  if (!confirmed.length && !pending.length) return open ? <p className={styles.olHead}>Findings show here as they&apos;re checked</p> : null;
  return (
    <>
      {confirmed.length ? <div className={styles.olHead}>Confirmed</div> : null}
      {confirmed.map((c) => (
        <div key={c.key} className={styles.olRow} {...tip(open, c.title)}>
          <span className={styles.olKey}>
            <span className={cn(belay.dot, TONE_DOT[severityTone(c)])} aria-hidden />
          </span>
          {open ? <span className={styles.olText}>{c.title}</span> : null}
        </div>
      ))}
      {pending.length ? <div className={styles.olHead}>Checking</div> : null}
      {pending.map((c) => (
        <div key={c.key} className={cn(styles.olRow, styles.olPend)} {...tip(open, `${c.title} (checking)`)}>
          <span className={styles.olKey}>
            <DoingIcon />
          </span>
          {open ? <span className={styles.olText}>{c.title}</span> : null}
        </div>
      ))}
    </>
  );
}
