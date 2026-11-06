"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import belay from "@/components/belay/belay.module.css";
import { Facts, type Fact } from "@/components/belay/facts";
import { GroupDetails } from "@/components/belay/group-details";
import { StatusIcon } from "@/components/belay/status-icon";
import { toast, toastError } from "@/components/belay/toaster";
import { PageCommands, type PageCommand } from "@/components/layout/palette";
import { ShellSlot } from "@/components/layout/shell-slot";
import { sendTo } from "@/components/live/live-provider";
import { projectColor } from "@/components/project-mark";
import shared from "@/components/session/session.module.css";
import { Button } from "@/components/ui/button";
import { OUTLINE_KEY, parseOutline } from "@/lib/shell";
import { cn } from "@/lib/utils";
import type { Decision, Finding } from "../../cli/state.ts";
import type { ReviewDetail } from "../_lib/detail.server";
import { decide, openReviewTerminal, track } from "../_lib/review-actions";
import {
  at,
  checkingSplit,
  decisionChip,
  elapsed,
  filterQuery,
  groups,
  kindLabel,
  kindTabs,
  nextUndecided,
  overviewGroups,
  parseFilter,
  parseView,
  queueAllNumbers,
  reviewTitle,
  segments,
  sentence,
  severityTone,
  severityWord,
  shown,
  stageRows,
  statusTabs,
  step,
  toFix,
  verdictLine,
  viewHash,
  walkStart,
  type Filter,
  type Tab,
  type View,
} from "../_lib/view";
import { HunkView } from "./hunk";
import { DoingIcon, findingDot, Outline } from "./outline";
import styles from "./review.module.css";

// The Unfiled pseudo-project's key; `_lib/manifest.ts` is fine to import, but this keeps the client bundle lean.
const UNFILED_KEY = "unfiled";

// Until the walk follows the Overview's filter, it covers every finding.
const EVERY: Filter = { status: "all", kind: null };

const subscribeHash = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};

const goTo = (v: View) => {
  const h = viewHash(v);
  if (location.hash !== h) location.hash = h;
};

/** Swaps the query and keeps the view hash; Next's router follows `replaceState`, so `useSearchParams` updates without a server round trip. */
const replaceFilter = (f: Filter) => history.replaceState(null, "", `${location.pathname}${filterQuery(f)}${location.hash}`);

const editable = (t: EventTarget | null) =>
  !!t && "tagName" in t && (/^(INPUT|TEXTAREA|SELECT)$/.test((t as Element).tagName) || (t as HTMLElement).isContentEditable);

/** Whether the Outline is expanded, per browser: the same toggle as a grill's. */
function useOutlineOpen() {
  const [open, setOpen] = React.useState(true);
  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(OUTLINE_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
    setOpen(parseOutline(raw));
  }, []);
  const toggle = React.useCallback(() => {
    setOpen((o) => {
      try {
        localStorage.setItem(OUTLINE_KEY, JSON.stringify(!o));
      } catch {}
      return !o;
    });
  }, []);
  return [open, toggle] as const;
}

/** The clock for a running review's times, ticking each second while it runs. */
function useNow(running: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

type Actions = {
  pending: boolean;
  decideOn: (ns: number[], action: Exclude<Decision, "track"> | "clear") => void;
  toggle: (f: Finding, action: "fix" | "skip") => void;
  trackOn: (n: number) => void;
  ask: (kind: "ask" | "investigate" | "tests", n: number) => void;
  apply: () => void;
};

/** A review's Workspace: the Outline beside a bar and a canvas showing its Overview, one finding, or its progress. */
export function ReviewWorkspace({ d }: { d: ReviewDetail }) {
  const router = useRouter();
  const { review, findings, decisions } = d;
  const id = review.id;
  const running = review.status === "running";
  const hash = React.useSyncExternalStore(subscribeHash, () => location.hash, () => "");
  const view = running ? ({ kind: "overview" } as const) : parseView(hash, findings);
  const filter = parseFilter(useSearchParams());
  const [outlineOpen, toggleOutline] = useOutlineOpen();
  const now = useNow(running);
  const [pending, startTransition] = React.useTransition();
  const [command, setCommand] = React.useState<{ command: string; dir?: string } | null>(null);
  const title = reviewTitle(review);
  const queued = toFix(decisions);
  const reattach = `Not attached: run /review:review resume ${id} in a session started with belay claude`;

  /** Tells a live session; a decision is already saved, so a session that isn't there misses nothing. */
  const tell = React.useCallback((msg: Record<string, unknown>) => (d.connected ? sendTo(id, msg) : Promise.resolve(null)), [d.connected, id]);

  const actions: Actions = {
    pending,
    decideOn: (ns, action) =>
      startTransition(async () => {
        const r = await decide(id, ns, action);
        if (r.error) return toastError(r.error);
        await tell({ kind: "decide", n: ns, decision: action });
        router.refresh();
      }),
    toggle: (f, action) => actions.decideOn([f.n], decisions[f.n]?.decision === action ? "clear" : action),
    trackOn: (n) =>
      startTransition(async () => {
        const r = await track(id, n);
        if (r.error) return toastError(r.error);
        toast(`Tracked #${n} as ${r.issue}`);
        await tell({ kind: "track", n, ...(r.issue && { issue: r.issue }) });
        router.refresh();
      }),
    ask: (kind, n) => {
      if (!d.connected) return toastError(reattach);
      void sendTo(id, { kind, n }).then((err) => (err ? toastError(err) : toast(kind === "ask" ? `Asked about #${n} in the Drawer` : `Sent ${kind === "tests" ? "Write test" : "Investigate"} for #${n}`)));
    },
    apply: () =>
      startTransition(async () => {
        if (d.connected) {
          const err = await sendTo(id, { kind: "apply" });
          return err ? toastError(err) : toast("Applying the queued fixes in the terminal");
        }
        const r = await openReviewTerminal(id);
        if (r.error) return toastError(r.error);
        if (r.command) setCommand({ command: r.command, dir: r.dir });
        else toast("Opened a terminal to apply the fixes");
      }),
  };

  const finding = view.kind === "finding" ? findings.find((f) => f.n === view.n)! : null;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
      const k = e.key.toLowerCase();
      if (!finding) {
        if (k === "j") {
          const n = walkStart(findings, decisions, EVERY);
          if (n != null) goTo({ kind: "finding", n });
        }
        return;
      }
      const move = (by: 1 | -1) => {
        const n = step(findings, decisions, EVERY, finding.n, by);
        if (n != null) goTo({ kind: "finding", n });
      };
      if (k === "j") move(1);
      else if (k === "k") move(-1);
      else if (k === "f" && !pending) actions.toggle(finding, "fix");
      else if (k === "s" && !pending) actions.toggle(finding, "skip");
      else if (k === "t" && !pending && review.project && !decisions[finding.n]?.issue) actions.trackOn(finding.n);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const resume = `belay claude "/review:review resume ${id}"`;
  const start = walkStart(findings, decisions, EVERY);
  const commands = React.useMemo<PageCommand[]>(
    () => [
      { id: "review-resume", label: `Copy ${resume}`, run: () => void navigator.clipboard.writeText(resume) },
      ...(start != null ? [{ id: "review-walk", label: "Walk through", shortcut: "J", run: () => goTo({ kind: "finding", n: start }) }] : []),
    ],
    [resume, start],
  );

  const pane = (
    <Outline title={title} running={running} findings={findings} decisions={decisions} checking={d.checking} view={view} open={outlineOpen} onToggle={toggleOutline} />
  );

  return (
    <div className={styles.root}>
      <ReviewSlot d={d} pane={pane} />
      <PageCommands heading={id} items={commands} />
      {running ? (
        <RunningBar d={d} title={title} now={now} />
      ) : finding ? (
        <FindingBar d={d} f={finding} />
      ) : (
        <OverviewBar d={d} title={title} />
      )}
      <div className={styles.canvas}>
        {running ? (
          <Stages d={d} now={now} />
        ) : finding ? (
          <div className={cn(styles.body, styles.walk)}>
            <Detail d={d} f={finding} />
            <FindingDock d={d} f={finding} queued={queued} a={actions} />
          </div>
        ) : (
          <Overview d={d} filter={filter} queued={queued} a={actions} />
        )}
        {!running && queued && !d.connected ? (
          <p className={styles.hint}>
            {command ? (
              <>
                No terminal could start. Run <code>{command.command}</code>
                {command.dir ? (
                  <>
                    {" "}
                    in <code>{command.dir}</code>
                  </>
                ) : null}
                <button type="button" className={styles.copy} onClick={() => void navigator.clipboard.writeText(command.command)}>
                  Copy
                </button>
              </>
            ) : (
              <>
                The review&apos;s terminal is closed. Apply opens a new one running <code>{resume}</code>.
              </>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Tells the shell where the review sits, and hands it the Outline. */
function ReviewSlot({ d, pane }: { d: ReviewDetail; pane: React.ReactNode }) {
  const project = React.useMemo(() => ({ key: d.mark?.key ?? UNFILED_KEY, name: d.mark?.name ?? "Unfiled" }), [d.mark]);
  return <ShellSlot project={project} section="Reviews" pane={pane} glow={d.mark ? projectColor(d.mark) : undefined} />;
}

function Segs({ d, current }: { d: ReviewDetail; current: number | null }) {
  return (
    <span className={styles.segs} aria-hidden>
      {segments(d.findings, d.decisions, EVERY, current).map((s, i) => (
        <i key={i} className={styles[`seg-${s}`]} />
      ))}
    </span>
  );
}

function Bar({ badge, title, chips, note, children }: { badge?: string; title: string; chips: React.ReactNode; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={styles.bar}>
      <div className={styles.top}>
        {badge ? <span className={styles.qbadge}>{badge}</span> : null}
        <div className={styles.tt}>
          <div className={styles.tline}>
            <h1 className={styles.title} title={title}>
              {title}
            </h1>
            {chips}
          </div>
          <div className={styles.note}>{note}</div>
        </div>
      </div>
      <span className={styles.acts}>{children}</span>
    </div>
  );
}

function RunningBar({ d, title, now }: { d: ReviewDetail; title: string; now: number }) {
  const { review } = d;
  const { mustFix, pending } = checkingSplit(d.checking);
  const so = elapsed(review.started, null, now);
  return (
    <Bar
      title={title}
      chips={<span className={cn(styles.chip, styles.chipOpen)}>Reviewing</span>}
      note={[review.ref, `started ${clock(review.started)}`, `${so} so far`].filter(Boolean).join(" · ")}
    >
      {mustFix ? <span className={cn(styles.chip, styles.chipBad)}>{mustFix} must-fix</span> : null}
      {pending.length ? <span className={styles.chip}>{pending.length} checking</span> : null}
      <button
        type="button"
        className={cn(shared.btn, styles.btn)}
        disabled={!d.connected}
        title={d.connected ? "Ask the session to stop the review" : "No terminal attached"}
        onClick={() => void sendTo(review.id, { kind: "stop" }).then((err) => err && toastError(err))}
      >
        Stop
      </button>
    </Bar>
  );
}

function OverviewBar({ d, title }: { d: ReviewDetail; title: string }) {
  const { review, findings, decisions } = d;
  const must = d.counts.mustFix;
  const start = walkStart(findings, decisions, EVERY);
  const note = [
    review.ref,
    `${day(review.started)} ${clock(review.started)}`,
    review.tier && `${review.tier} review`,
    review.status === "stopped" && "stopped",
    review.partial && "partial",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Bar
      title={title}
      chips={must ? <span className={cn(styles.chip, styles.chipBad)}>{must} must-fix</span> : <span className={cn(styles.chip, styles.chipOk)}>Nothing must be fixed</span>}
      note={note}
    >
      <Segs d={d} current={null} />
      <button
        type="button"
        className={cn(shared.btn, styles.btn)}
        disabled={!d.connected}
        title={d.connected ? "Ask the session to review again" : "No terminal attached"}
        onClick={() => void sendTo(review.id, { kind: "rerun" }).then((err) => err && toastError(err))}
      >
        Re-run
      </button>
      {start != null ? (
        <a href={`#f-${start}`} className={cn(shared.btn, shared.primary, styles.btn)}>
          Walk through
        </a>
      ) : null}
    </Bar>
  );
}

function FindingBar({ d, f }: { d: ReviewDetail; f: Finding }) {
  const list = shown(d.findings, d.decisions, EVERY);
  const i = list.findIndex((x) => x.n === f.n);
  const prev = step(d.findings, d.decisions, EVERY, f.n, -1);
  const next = step(d.findings, d.decisions, EVERY, f.n, 1);
  const tone = severityTone(f);
  const verified = f.verdict === "confirmed" ? "confirmed by the verifier" : f.verdict;
  return (
    <Bar
      badge={`#${f.n}`}
      title={f.title}
      chips={<span className={cn(styles.chip, tone === "bad" ? styles.chipBad : tone === "warn" ? styles.chipWarn : undefined)}>{severityWord(f.severity)}</span>}
      note={
        <>
          <code className={styles.at}>{at(f)}</code>
          {f.found_by.length ? ` · found by ${f.found_by.join(" and ")}` : ""}
          {verified ? `, ${verified}` : ""}
        </>
      }
    >
      <span className={styles.pos}>
        {i + 1} of {list.length}
      </span>
      <Segs d={d} current={f.n} />
      <span className={styles.nav}>
        <Button variant="ghost" size="icon-sm" title="Previous (K)" aria-label="Previous finding" disabled={prev == null} onClick={() => prev != null && goTo({ kind: "finding", n: prev })}>
          <ChevronLeft size={16} aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Next (J)" aria-label="Next finding" disabled={next == null} onClick={() => next != null && goTo({ kind: "finding", n: next })}>
          <ChevronRight size={16} aria-hidden />
        </Button>
      </span>
    </Bar>
  );
}

/** The Overview's facts: verdict, checks, what was covered. */
function overviewFacts(d: ReviewDetail): Fact[] {
  const { review, findings } = d;
  const more = verdictLine(findings);
  const checks = review.stages.find((s) => s.name === "checks");
  const failed = findings.filter((f) => f.found_by.includes("checks")).length;
  const files = review.preview?.files ?? d.coverage?.files;
  const reviewers = review.preview?.reviewers;
  return [
    [
      "Verdict",
      <>
        {more.strong ? <span className={styles.verd}>{more.strong}</span> : null}
        <span className={belay.muted}>{more.rest}</span>
      </>,
    ],
    [
      "Checks",
      checks?.status !== "done" ? (
        <span className={belay.muted}>Not run</span>
      ) : failed ? (
        <span className={cn(styles.pill, styles.pillBad)}>{failed} failed</span>
      ) : (
        <span className={cn(styles.pill, styles.pillOk)}>
          <Check aria-hidden />
          No failures
        </span>
      ),
    ],
    ["Covered", [files != null && `${files} files`, reviewers != null && `${reviewers} reviewers`].filter(Boolean).join(" · ") || <span className={belay.muted}>None</span>],
  ];
}

function Overview({ d, filter, queued, a }: { d: ReviewDetail; filter: Filter; queued: number; a: Actions }) {
  const { findings, decisions } = d;
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [open, setOpen] = React.useState<number | null>(null);
  const pick = (n: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(n)) next.add(n);
      return next;
    });
  const changeFilter = (f: Filter) => {
    setSelected(new Set());
    setOpen(null);
    replaceFilter(f);
  };
  const list = overviewGroups(findings, decisions, filter);
  const walk = list.flatMap((g) => g.findings);
  const queueAll = queueAllNumbers(findings, decisions, filter);
  const unfiltered = filter.status === "all" && filter.kind == null;
  /** Queue fix or Skip on an opened row: set, the row closes and the next undecided one opens; pressed again, it clears. */
  const decideRow = (f: Finding, action: "fix" | "skip") => {
    const setting = decisions[f.n]?.decision !== action;
    a.toggle(f, action);
    if (setting) setOpen(nextUndecided(walk, decisions, f.n));
  };
  const bulk = (action: "fix" | "skip") => {
    a.decideOn([...selected], action);
    setSelected(new Set());
  };
  const any = groups(findings).length > 0;
  return (
    <>
      <Facts facts={overviewFacts(d)} />
      {any ? (
        <div className={styles.tabs}>
          <Tabs tabs={statusTabs(findings, decisions, filter)} to={(status) => ({ ...filter, status })} onPick={changeFilter} />
          <Tabs tabs={kindTabs(findings, decisions, filter)} to={(kind) => ({ ...filter, kind })} onPick={changeFilter} className={styles.kindTabs}>
            <Button variant="outline" size="sm" className={styles.queueAll} disabled={a.pending || !queueAll.length} onClick={() => a.decideOn(queueAll, "fix")}>
              {unfiltered ? "Queue all" : `Queue ${queueAll.length} shown`}
            </Button>
          </Tabs>
        </div>
      ) : null}
      {!any ? <p className={belay.empty}>No findings.</p> : list.length ? null : <p className={belay.empty}>No findings match.</p>}
      {list.map((g) => (
        <GroupDetails key={g.label} id={`review-${g.label}`} label={g.label} count={g.findings.length} open={!g.collapsed} defaultOpen={!g.collapsed}>
          <ul className={belay.rows}>
            {g.findings.map((f) => {
              const dec = decisions[f.n];
              const tone = severityTone(f);
              return (
                <React.Fragment key={f.n}>
                  <li className={belay.row}>
                    <input type="checkbox" className={cn(styles.check, belay.above)} checked={selected.has(f.n)} onChange={() => pick(f.n)} aria-label={`Select #${f.n}`} />
                    <span className={belay.dotSlot} title={decisionChip(dec)?.text}>
                      <span className={cn(belay.dot, findingDot(f, dec))} aria-hidden />
                    </span>
                    <span className={belay.keyTitle}>
                      <span className={cn(belay.key, styles.nkey)}>#{f.n}</span>
                      <button type="button" className={cn(belay.grow, belay.stretch, styles.rowBtn)} aria-expanded={open === f.n} onClick={() => setOpen((o) => (o === f.n ? null : f.n))}>
                        {f.title}
                      </button>
                    </span>
                    <span className={cn(belay.side, styles.kind)}>
                      {f.must_fix ? <span className={cn(styles.chip, tone === "bad" ? styles.chipBad : styles.chipWarn)}>{severityWord(f.severity)}</span> : null}
                      <span className={styles.chip}>{kindLabel(f.kind)}</span>
                    </span>
                  </li>
                  {open === f.n ? (
                    <li className={styles.inset}>
                      <Detail d={d} f={f} />
                      <div className={styles.insetActs}>
                        <Button variant="subtle" size="sm" aria-pressed={dec?.decision === "fix"} disabled={a.pending} onClick={() => decideRow(f, "fix")}>
                          {dec?.decision === "fix" ? "Queued" : "Queue fix"}
                        </Button>
                        <Button variant="outline" size="sm" aria-pressed={dec?.decision === "skip"} disabled={a.pending} onClick={() => decideRow(f, "skip")}>
                          {dec?.decision === "skip" ? "Skipped" : "Skip"}
                        </Button>
                        <span className={styles.actSep} />
                        <AskButtons d={d} n={f.n} a={a} variant="outline" />
                      </div>
                    </li>
                  ) : null}
                </React.Fragment>
              );
            })}
          </ul>
        </GroupDetails>
      ))}
      {any ? (
        <div className={styles.dock}>
          <span className={styles.dockN}>{selected.size} selected</span>
          <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <span className={styles.dockSep} />
          <Button variant="outline" size="sm" disabled={a.pending || !selected.size} onClick={() => bulk("fix")}>
            Queue fix
          </Button>
          <Button variant="outline" size="sm" disabled={a.pending || !selected.size} onClick={() => bulk("skip")}>
            Skip
          </Button>
          <span className={styles.dockSep} />
          <ApplyButton d={d} queued={queued} a={a} />
        </div>
      ) : null}
    </>
  );
}

/** A row of filter pills; each links to its filter, swapped in place on a plain click. */
function Tabs<K>({
  tabs,
  to,
  onPick,
  className,
  children,
}: {
  tabs: Tab<K>[];
  to: (key: K) => Filter;
  onPick: (f: Filter) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(belay.filter, className)} role="tablist">
      {tabs.map((t) => (
        <a
          key={String(t.key)}
          href={`${filterQuery(to(t.key)) || "?"}#overview`}
          role="tab"
          aria-selected={t.on}
          className={cn(belay.pill, t.on && belay.pillOn)}
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onPick(to(t.key));
          }}
        >
          {t.label}
          <span className={belay.count}>{t.count}</span>
        </a>
      ))}
      {children}
    </div>
  );
}

function ApplyButton({ d, queued, a }: { d: ReviewDetail; queued: number; a: Actions }) {
  return (
    <Button size="sm" disabled={a.pending || !queued} title={d.connected ? undefined : "Opens a terminal to apply them"} onClick={a.apply}>
      Apply {queued} {queued === 1 ? "fix" : "fixes"}
    </Button>
  );
}

function AskButtons({ d, n, a, variant }: { d: ReviewDetail; n: number; a: Actions; variant: "outline" | "ghost" }) {
  const off = d.connected ? undefined : "No terminal attached";
  return (
    <>
      <Button variant={variant} size="sm" disabled={!d.connected} title={off} onClick={() => a.ask("ask", n)}>
        Ask
      </Button>
      <Button variant={variant} size="sm" disabled={!d.connected} title={off ?? "Opus traces callers and the root cause, and proposes 2–3 fixes. Read-only."} onClick={() => a.ask("investigate", n)}>
        Investigate
      </Button>
      <Button variant={variant} size="sm" disabled={!d.connected} title={off} onClick={() => a.ask("tests", n)}>
        Write test
      </Button>
    </>
  );
}

/** A finding's description (impact and suggested fix) and its saved hunk. */
function Detail({ d, f }: { d: ReviewDetail; f: Finding }) {
  const hunk = d.hunks[f.n];
  const dec = d.decisions[f.n];
  return (
    <>
      <div className={styles.desc}>
        {f.impact ? <p className={styles.imp}>{sentence(f.impact)}</p> : null}
        {f.fix ? (
          <div className={styles.fix}>
            <span className={styles.lab}>Suggested fix</span>
            <span>{f.fix}</span>
          </div>
        ) : null}
        {f.needs_observation ? (
          <div className={styles.fix}>
            <span className={styles.lab}>To settle it</span>
            <span>{f.needs_observation}</span>
          </div>
        ) : null}
        {dec?.outcome === "manual" ? (
          <div className={styles.fix}>
            <span className={styles.lab}>Manual follow-up</span>
            <span>{dec.note ?? "The fix couldn't be applied as queued."}</span>
          </div>
        ) : null}
      </div>
      {hunk ? <HunkView id={d.review.id} n={f.n} hunk={hunk} /> : <p className={styles.note}>No saved code for this finding.</p>}
    </>
  );
}

function Kbd({ k }: { k: string }) {
  return <kbd className={styles.k}>{k}</kbd>;
}

function FindingDock({ d, f, queued, a }: { d: ReviewDetail; f: Finding; queued: number; a: Actions }) {
  const dec = d.decisions[f.n];
  const tracked = dec?.issue;
  return (
    <div className={styles.dock}>
      <Button variant="subtle" size="sm" aria-pressed={dec?.decision === "fix"} disabled={a.pending} onClick={() => a.toggle(f, "fix")}>
        {dec?.decision === "fix" ? "Queued" : "Queue fix"}
        <Kbd k="F" />
      </Button>
      <Button variant="outline" size="sm" aria-pressed={dec?.decision === "skip"} disabled={a.pending} onClick={() => a.toggle(f, "skip")}>
        {dec?.decision === "skip" ? "Skipped" : "Skip"}
        <Kbd k="S" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={a.pending || !!tracked || !d.review.project}
        title={tracked ? `Tracked as ${tracked}` : d.review.project ? `Add it as an idea in ${d.review.project}` : "This review has no project to add an idea to"}
        onClick={() => a.trackOn(f.n)}
      >
        {tracked ?? "Track"}
        <Kbd k="T" />
      </Button>
      <span className={styles.dockSep} />
      <AskButtons d={d} n={f.n} a={a} variant="ghost" />
      <span className={styles.dockSep} />
      <ApplyButton d={d} queued={queued} a={a} />
    </div>
  );
}

/** A running review's stage timeline: each stage's status icon, label, detail and time. */
function Stages({ d, now }: { d: ReviewDetail; now: number }) {
  const { review } = d;
  const p = review.preview;
  const detail = (name: string, count: { done: number; of: number; pct: number } | null, status: string) => {
    if (name === "plan" && review.tier) {
      return [sentence(review.tier), p?.files != null && `${p.files} files`, p?.reviewers != null && `${p.reviewers} reviewers`]
        .filter((x): x is string => !!x)
        .map((b) => (
          <span key={b} className={belay.badge}>
            {b}
          </span>
        ));
    }
    if (name === "checks" && status === "done") {
      return (
        <span className={cn(styles.pill, styles.pillOk)}>
          <Check aria-hidden />
          Ran
        </span>
      );
    }
    if (count) {
      return (
        <span className={cn(shared.pills, shared.pillsCompact)}>
          <span className={shared.pill} style={{ "--pct": `${count.pct}%` } as React.CSSProperties}>
            <b>{count.done}</b>
            <small>/{count.of}</small> {name === "reviewers" ? "returned" : "checked"}
          </span>
        </span>
      );
    }
    return null;
  };
  return (
    <ol className={styles.stages}>
      {stageRows(review.stages, now).map((s) => (
        <li key={s.name} className={cn(styles.stg, s.status === "todo" && styles.stgWait)}>
          <span className={styles.stgIco}>{s.status === "doing" ? <DoingIcon size={16} /> : <StatusIcon status={s.status} size={16} label={sentence(s.status)} />}</span>
          <b>{s.label}</b>
          <span className={styles.stgDetail}>{detail(s.name, s.count, s.status)}</span>
          <span className={styles.stgT}>{s.time}</span>
        </li>
      ))}
    </ol>
  );
}
