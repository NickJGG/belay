"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Copy, X } from "lucide-react";
import { PageCommands, type PageCommand } from "@/components/layout/palette";
import { ShellSlot } from "@/components/layout/shell-slot";
import { subscribeLive } from "@/components/live/event-hub";
import { sendTo, useLive } from "@/components/live/live-provider";
import { projectColor } from "@/components/project-mark";
import {
  followAction,
  optForKey,
  parseRemembered,
  REMEMBERED_DEFAULTS,
  rememberKey,
  stepView,
  type Remembered,
  type ViewState,
} from "../_lib/behaviours";
import type { Mark } from "@/lib/data";
import { frameDoc, loadSpec, renderBody, type MockFile, type Spec } from "../_lib/mock";
import {
  BEFORE,
  context,
  decisions,
  defaultOpt,
  initialView,
  parseViewHash,
  viewControls,
  viewHash,
  type Question,
  type SessionDoc,
  type StageView,
  type View,
} from "../_lib/session-doc";
import type { GrillIssue } from "../_lib/detail.server";
import { usePendingComment } from "./pending-comment";
import type { GrillLive } from "../_lib/runtime.server";
import type { QuestionSummary } from "../_lib/sessions";
import { OUTLINE_KEY, parseOutline } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Bar, type CommentProps, type PickProps } from "./bar";
import type { LinkState, Send } from "@/components/session/drawer";
import { Frame } from "./frame";
import { Outline, OutlineList } from "./outline";
import { Overview } from "./overview";
import shared from "@/components/session/session.module.css";
import styles from "./workspace.module.css";

/** What the grill page passes about the grill beside its doc. */
export type SessionNav = {
  slug: string;
  topic: string;
  project?: string;
  /** The project it's filed under; null when unfiled. */
  mark: Mark | null;
  status: string;
  live: boolean;
  /** Null for a session without session.json (an old grill session). */
  questions: QuestionSummary[] | null;
  /** Its project's page, or Unfiled's. */
  back: string;
};

type Props = {
  doc: SessionDoc;
  issues: GrillIssue[];
  files: Partial<Record<MockFile, number>>;
  live: GrillLive | null;
  nav: SessionNav;
};

const subscribeHash = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};

function useView(doc: SessionDoc): View {
  const hash = React.useSyncExternalStore(subscribeHash, () => location.hash, () => "");
  return parseViewHash(hash, doc) ?? initialView(doc);
}

const fileUrl = (slug: string, name: MockFile, v: number | undefined) => `/api/s/${slug}/files/${name}?v=${Math.round(v ?? 0)}`;

/** The session's spec (with its data file), re-fetched when either file changes; null until loaded. */
function useSpec(slug: string, files: Props["files"], enabled: boolean) {
  const specV = files["preview.spec.js"];
  const dataV = files["preview.data.js"];
  const [state, setState] = React.useState<{ key: string; spec: Spec | null; error: string | null }>({ key: "", spec: null, error: null });
  const key = `${specV}:${dataV}`;
  React.useEffect(() => {
    if (!enabled || specV === undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const get = async (name: MockFile, v: number | undefined) => {
          const r = await fetch(fileUrl(slug, name, v), { cache: "no-store" });
          if (!r.ok) throw new Error(`${name}: ${r.status}`);
          return r.text();
        };
        const [specText, dataText] = await Promise.all([get("preview.spec.js", specV), dataV !== undefined ? get("preview.data.js", dataV) : ""]);
        const spec = loadSpec(specText, dataText);
        if (!cancelled) setState({ key, spec, error: null });
      } catch (err) {
        // Keep the last good spec on screen while Claude is mid-edit.
        if (!cancelled) setState((s) => ({ key, spec: s.spec, error: (err as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, specV, dataV, key, enabled]);
  if (!enabled) return { spec: null, error: null, missing: false };
  return { spec: state.spec, error: state.error, missing: specV === undefined };
}

const editable = (t: EventTarget | null) =>
  !!t && "tagName" in t && (/^(INPUT|TEXTAREA|SELECT)$/.test((t as Element).tagName) || (t as HTMLElement).isContentEditable);

/** Per-session state from localStorage, loaded after hydration and saved on every change. */
function useRemembered(slug: string) {
  const [r, setR] = React.useState<Remembered>(REMEMBERED_DEFAULTS);
  const [loaded, setLoaded] = React.useState<string | null>(null);
  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(rememberKey(slug));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
    setR(parseRemembered(raw));
    setLoaded(slug);
  }, [slug]);
  React.useEffect(() => {
    if (loaded !== slug) return;
    try {
      localStorage.setItem(rememberKey(slug), JSON.stringify(r));
    } catch {}
  }, [r, loaded, slug]);
  const set = React.useCallback(<K extends keyof Remembered>(k: K, v: Remembered[K] | ((old: Remembered[K]) => Remembered[K])) => {
    setR((o) => ({ ...o, [k]: typeof v === "function" ? (v as (old: Remembered[K]) => Remembered[K])(o[k]) : v }));
  }, []);
  return [r, set] as const;
}

/** Whether the Outline is expanded, per browser. */
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

const goTo = (hash: string) => {
  if (location.hash !== hash) location.hash = hash;
};

export function SessionWorkspace({ doc, issues, files, live, nav }: Props) {
  const router = useRouter();
  const view = useView(doc);
  const [shown, setShown] = React.useState<{ q: number; opt?: string } | null>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const key = viewHash(view);
  const q: Question | null = view.kind === "q" ? (doc.questions.find((x) => x.n === view.n) ?? null) : null;

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The conversation is the shell's (LiveProvider); this page follows Claude's shows and its mock files.
    const unsubscribe = subscribeLive((e) => {
      if (e.type === "bridge" && e.slug === doc.slug) {
        const ev = e.event;
        if (ev.type === "show" && typeof ev.q === "number") setShown({ q: ev.q, ...(typeof ev.opt === "string" ? { opt: ev.opt } : {}) });
        return;
      }
      if (e.type !== "file" || e.slug !== doc.slug || e.name === "chat.jsonl") return;
      else {
        // A mock file changed: the server re-reads the files' mtimes, which re-fetch the spec and re-load the CSS.
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 200);
      }
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [doc.slug, router]);

  const mock = doc.mock;
  const { spec, error: specError, missing } = useSpec(doc.slug, files, mock != null);

  const [remembered, remember] = useRemembered(doc.slug);
  const [outlineOpen, toggleOutline] = useOutlineOpen();
  const { states, device, compare, split } = remembered;
  const setDevice = (d: Remembered["device"]) => remember("device", d);
  const shell = useLive();
  // The Drawer shows this grill only while it's the selected Tab, so only then can a comment be pinned for it.
  const mine = shell.selected?.slug === doc.slug;
  const { comment: pinned, setComment: setPending } = usePendingComment();
  const pending = mine ? pinned : null;
  const { setDrawer, setSheet } = shell;
  const setSplit = (r: number) => remember("split", r);

  const st = states[key] ?? { ctl: {} };
  const patchAt = (at: string, p: Partial<ViewState>) => remember("states", (s) => ({ ...s, [at]: { ...(s[at] ?? { ctl: {} }), ...p } }));
  const patch = (p: Partial<ViewState>) => patchAt(key, p);

  const qMocked = !!(mock && q?.mock);
  const keys = new Set(q?.opts?.map((o) => o.key));
  // Options can vanish when session.json changes, so a remembered one is checked before use.
  const valid = (k: string | undefined): k is string => !!k && (keys.has(k) || (qMocked && k === BEFORE));
  const optValue = q ? (valid(st.opt) ? st.opt : defaultOpt(q)) : BEFORE;
  const vs = (() => {
    if (!q) return BEFORE;
    if (st.vs && (keys.has(st.vs) || st.vs === BEFORE) && st.vs !== optValue) return st.vs;
    const other = [q.rec, ...(q.opts ?? []).map((o) => o.key)].find((k) => k && k !== optValue);
    return other ?? BEFORE;
  })();

  const overview = view.kind === "overview";
  // What the stage draws: this question's mock, else Current design under a "no mock" label. Overview draws none.
  const stageView: StageView = view.kind === "overview" || (view.kind === "q" && !qMocked) ? { kind: "current" } : view;
  const controls = spec?.CONTROLS ?? {};
  const controlKeys = mock && spec && !overview ? viewControls(doc, stageView, controls) : [];
  const phone = device === "phone";

  const styleUrls = mock
    ? [
        ...(mock.fonts ?? []),
        ...(mock.appCss && files["preview.app.css"] !== undefined ? [fileUrl(doc.slug, "preview.app.css", files["preview.app.css"])] : []),
        ...(files["preview.mock.css"] !== undefined ? [fileUrl(doc.slug, "preview.mock.css", files["preview.mock.css"])] : []),
      ]
    : [];

  /** The frame label: what this frame draws, from the option (or view) it shows. */
  const optionLine = (o: string): { label: React.ReactNode; labelText: string } => {
    const line = (lead: string, text: string, from?: string) => ({
      label: (
        <>
          <b>{lead}</b>
          {from ? <span className={styles.from}>from {from}</span> : null} {text}
        </>
      ),
      labelText: `${lead}${from ? ` from ${from}` : ""} ${text}`.trim(),
    });
    if (stageView.kind === "today") return line("Today.", "The page as it was before this session. This never changes.");
    const current = `Every decision you’ve made so far, combined. Nothing proposed: a part whose question is still open is drawn as it ${mock?.page === "existing" ? "looks before this session" : "will sit, as a labelled grey block"}.`;
    if (stageView.kind === "current") return line("Current design.", view.kind === "q" ? `Q${view.n} has no mock. ${current}` : current);
    if (o === BEFORE) return line("Before.", "This question’s region without its change: your other picks, but not this one.");
    const opt = q?.opts?.find((x) => x.key === o);
    return opt ? line(`${opt.key} · ${opt.name}`, opt.expl ?? "", opt.from) : line(o, "");
  };

  const render = (o: string) => {
    if (!spec || !mock) return null;
    const sq = stageView.kind === "q" ? q : null;
    const d = decisions(doc, spec.BASE, stageView, o);
    const ctx = context(controls, sq, st.ctl, phone);
    const html = frameDoc({ body: renderBody(spec, d, ctx), theme, styles: styleUrls });
    return { html, ...optionLine(o) };
  };

  const [commentMode, setCommentMode] = React.useState(false);
  const [commentFor, setCommentFor] = React.useState(key);
  if (commentFor !== key) {
    setCommentFor(key);
    setCommentMode(false);
  }
  // A comment belongs to the view it was pinned on.
  React.useEffect(() => {
    if (mine) setPending(null);
  }, [key, mine, setPending]);
  const screen = (q?.mock?.screen ?? mock?.screen ?? "page") as "shell" | "page";

  const linkState: LinkState = !live ? { state: "offline" } : live.connected ? { state: "connected", working: live.working } : { state: "disconnected" };

  const send: Send = React.useCallback((msg) => sendTo(doc.slug, msg), [doc.slug]);
  const [pickError, setPickError] = React.useState<string | null>(null);
  const [pickOpen, setPickOpen] = React.useState(false);
  const connected = linkState.state === "connected";

  const selected = q?.opts?.find((o) => o.key === optValue);
  const pick: PickProps | null =
    q && q.opts?.length
      ? {
          label: q.pick === optValue && q.status === "resolved" ? `✓ Picked ${optValue}` : optValue === BEFORE ? "Pick" : `Pick ${optValue}`,
          disabled: !connected || optValue === BEFORE || (q.pick === optValue && q.status === "resolved"),
          why: connected ? undefined : "No terminal attached",
          what: selected ? `${selected.key} · ${selected.name}` : optValue,
          open: pickOpen,
          onOpen: setPickOpen,
          onPick: async (note) => {
            setPickError(null);
            const err = await send({ kind: "answer", q: q.n, opt: optValue, ...(note ? { note } : {}) });
            if (err) setPickError(err);
            return !err;
          },
        }
      : null;

  // Comments name a question and an option, so they need this question's own mock on the stage.
  const comment: CommentProps | null =
    qMocked && spec
      ? {
          on: commentMode,
          disabled: !connected,
          why: connected ? undefined : "No terminal attached",
          onToggle: () => setCommentMode((c) => !c),
        }
      : null;
  const frameProps = (o: string) =>
    qMocked && q
      ? {
          comment: commentMode,
          pin: pending?.opt === o ? pending.selector : null,
          onPin: (p: { selector: string; text: string }) => {
            setPending({ q: q.n, opt: o, ...p });
            setCommentMode(false);
            setDrawer({ open: true });
            setSheet(true);
          },
        }
      : {};

  // Follow along. `followed` is where follow along last put the user (at first, where the page opened).
  const followed = React.useRef<string | null>(null);
  const [pill, setPill] = React.useState<string | null>(null);
  const [pulse, setPulse] = React.useState<number | null>(null);
  if (pill && pill === key) setPill(null);
  const busy = commentMode || !!pending || pickOpen;
  React.useEffect(() => {
    followed.current ??= viewHash(parseViewHash(location.hash, doc) ?? initialView(doc));
    // A show can arrive before session.json has its question; it waits for the doc to catch up.
    if (!shown || !doc.questions.some((x) => x.n === shown.q)) return;
    const target = `#q-${shown.q}`;
    const here = viewHash(parseViewHash(location.hash, doc) ?? initialView(doc));
    // Mid-comment or mid-note the user is busy here, so a jump would throw their text away.
    const act = busy && here !== target ? "pill" : followAction(here, followed.current, target);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applies an event that had to wait for session.json
    setShown(null);
    setPulse(shown.q);
    if (act === "pill") setPill(target);
    else {
      followed.current = target;
      setPill(null);
      if (shown.opt) remember("states", (s) => ({ ...s, [target]: { ...(s[target] ?? { ctl: {} }), opt: shown.opt } }));
      goTo(target);
    }
  }, [shown, doc, remember, busy]);
  React.useEffect(() => {
    if (pulse == null) return;
    const t = setTimeout(() => setPulse(null), 3600);
    return () => clearTimeout(t);
  }, [pulse]);

  // Keyboard, in a ref so the document listener sees this render. Frames re-dispatch theirs here.
  const shortcut = React.useRef<(e: KeyboardEvent) => void>(() => {});
  React.useLayoutEffect(() => {
    shortcut.current = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
      const k = e.key;
      if (k === "Escape" && commentMode) setCommentMode(false);
      else if (k === "[" || k === "]") {
        const next = stepView(doc, view, k === "[" ? -1 : 1);
        if (next) goTo(viewHash(next));
      } else if (k === "\\") setDrawer((d) => ({ open: !d.open }));
      else if (k === "|") toggleOutline();
      else if (k === "p" && pick && !pick.disabled) setPickOpen(true);
      else if (k === "0" && qMocked) patch({ opt: BEFORE });
      else if (/^[a-z]$/.test(k) && q) {
        const next = optForKey(q, k, optValue);
        if (!next) return;
        patch({ opt: next });
      } else if (/^[A-Z]$/.test(k) && e.shiftKey && q && qMocked) {
        const next = optForKey(q, k.toLowerCase(), vs);
        if (!next || next === optValue) return;
        patch({ vs: next });
        remember("compare", true);
      } else return;
      e.preventDefault();
    };
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcut.current(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The grill page holds its /grill:grill resume command while no terminal is attached; once one is, the Drawer says what to do.
  const resume = !live && doc.status === "in-progress" ? `/grill:grill resume ${doc.slug}` : null;
  const [copied, setCopied] = React.useState(false);
  const copyResume = React.useCallback(() => {
    if (!resume) return;
    navigator.clipboard.writeText(resume).then(
      () => setCopied(true),
      () => {},
    );
  }, [resume]);
  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const commands = React.useMemo<PageCommand[]>(
    () => (resume ? [{ id: "resume", label: "Copy the resume command", icon: <Copy size={14} aria-hidden />, run: copyResume }] : []),
    [resume, copyResume],
  );

  const title = q ? q.title : overview ? "Overview" : view.kind === "today" ? "Today" : "Current design";
  let stage: React.ReactNode;
  if (overview) {
    stage = <Overview doc={doc} issues={issues} />;
  } else if (!mock) {
    stage = <QuestionCard q={q} doc={doc} />;
  } else if (missing) {
    stage = <p className={styles.stageNote}>This session has mock settings but no preview.spec.js yet.</p>;
  } else if (!spec) {
    stage = <p className={styles.stageNote}>{specError ? `The mock didn't load: ${specError}` : "Loading the mock…"}</p>;
  } else if (compare && qMocked && q) {
    const a = render(optValue)!;
    const b = render(vs)!;
    stage = (
      <Split ratio={split} onRatio={setSplit}>
        <Frame html={a.html} phone={phone} screen={screen} floor={mock.floor} label={a.label} labelText={a.labelText} {...frameProps(optValue)} />
        <div className={styles.paneWrap}>
          <label className={styles.vsPick}>
            vs{" "}
            <select value={vs} onChange={(e) => patch({ vs: e.target.value })}>
              <option value={BEFORE}>Before</option>
              {q.opts?.map((o) => (
                <option key={o.key} value={o.key} disabled={o.key === optValue}>
                  {o.key} · {o.name}
                </option>
              ))}
            </select>
          </label>
          <Frame html={b.html} phone={phone} screen={screen} floor={mock.floor} label={b.label} labelText={b.labelText} {...frameProps(vs)} />
        </div>
      </Split>
    );
  } else {
    const a = render(optValue)!;
    stage = <Frame html={a.html} phone={phone} screen={screen} floor={mock.floor} label={a.label} labelText={a.labelText} {...frameProps(optValue)} />;
  }

  return (
    <div className={styles.root}>
      <SessionSlot
        nav={nav}
        pane={<Outline doc={doc} here={key} opt={optValue} onOpt={(k) => patch({ opt: k })} pulse={pulse} open={outlineOpen} onToggle={toggleOutline} />}
      />
      <PageCommands heading={doc.slug} items={commands} />
      <div className={styles.ws}>
        <Bar
          title={title}
          q={q}
          opt={optValue}
          onOpt={(k) => patch({ opt: k })}
          mocked={stageView === view && !!mock && !!spec}
          controls={controls}
          controlKeys={controlKeys}
          chosen={st.ctl}
          onControl={(k, v) => patch({ ctl: { ...st.ctl, [k]: v } })}
          device={device}
          onDevice={setDevice}
          compare={compare}
          onCompare={() => remember("compare", (c) => !c)}
          pick={pick}
          comment={comment}
          outline={<OutlineList doc={doc} here={key} opt={optValue} onOpt={(k) => patch({ opt: k })} pulse={pulse} />}
          total={doc.questions.length}
        />
        {pickError || resume || (specError && spec) ? (
          <div className={styles.explLine}>
            {resume ? (
              <div className={styles.resume}>
                No terminal attached. Run <code>{resume}</code> in a session started with <code>belay claude</code> to answer from here.
                <button type="button" className={styles.more} onClick={copyResume}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}
            {specError && spec ? <div className={shared.err}>The latest mock edit didn&apos;t load ({specError}); showing the previous one.</div> : null}
            {pickError ? <div className={shared.err}>{pickError}</div> : null}
          </div>
        ) : null}
        <div className={styles.canvas}>
          {stage}
          {pill ? (
            <div className={styles.followDock} role="status">
              <span className={styles.followPill}>
                <i aria-hidden />
                {pill.replace("#q-", "Q")} is up
                <button
                  type="button"
                  onClick={() => {
                    followed.current = pill;
                    goTo(pill);
                  }}
                >
                  Go
                </button>
                <button type="button" className={styles.followX} onClick={() => setPill(null)} aria-label="Dismiss">
                  <X size={14} aria-hidden />
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Split({ ratio, onRatio, children }: { ratio: number; onRatio: (r: number) => void; children: [React.ReactNode, React.ReactNode] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = ref.current!.getBoundingClientRect();
    const move = (m: PointerEvent) => onRatio(Math.min(0.85, Math.max(0.15, (m.clientX - box.left) / box.width)));
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      document.body.classList.remove(shared.dragging);
    };
    document.body.classList.add(shared.dragging);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  return (
    <div ref={ref} className={styles.split}>
      <div className={styles.pane} style={{ flexBasis: `${ratio * 100}%` }}>
        {children[0]}
      </div>
      <span className={styles.divider} onPointerDown={startDrag} role="separator" aria-orientation="vertical" aria-label="Resize the comparison">
        ⇆
      </span>
      <div className={styles.pane} style={{ flexBasis: `${(1 - ratio) * 100}%` }}>
        {children[1]}
      </div>
    </div>
  );
}

/** A session without mocks: the question itself, its options and the answer. */
function QuestionCard({ q, doc }: { q: Question | null; doc: SessionDoc }) {
  if (!q) {
    return (
      <div className={styles.card}>
        <h2>{doc.topic}</h2>
        {doc.open ? <p>{doc.open}</p> : null}
        <p className={shared.dim}>{doc.questions.length ? "Pick a question on the left." : "No questions yet."}</p>
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <h2>
        <span className={styles.qn}>Q{q.n}</span> {q.title}
      </h2>
      {q.opts?.length ? (
        <ul className={styles.cardOpts}>
          {q.opts.map((o) => (
            <li key={o.key} className={cn(o.key === q.rec && styles.rec, o.out && styles.out, o.key === q.pick && styles.picked)}>
              <b>
                {o.key} · {o.name}
              </b>
              {o.key === q.rec ? <u>rec</u> : null}
              {o.expl ? <span>{o.expl}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={shared.dim}>No mock for this session.</p>
    </div>
  );
}

// data.ts's UNFILED, which this client module can't import (data.ts is server-only).
const UNFILED_KEY = "unfiled";

/** Tells the shell where the grill sits, and hands it the Outline. */
function SessionSlot({ nav, pane }: { nav: SessionNav; pane: React.ReactNode }) {
  const project = React.useMemo(() => ({ key: nav.mark?.key ?? UNFILED_KEY, name: nav.mark?.name ?? "Unfiled" }), [nav.mark]);
  return <ShellSlot project={project} section="Grills" pane={pane} glow={nav.mark ? projectColor(nav.mark) : undefined} />;
}
