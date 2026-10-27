"use client";

import * as React from "react";
import { subscribeLive } from "@/components/live/event-hub";
import type { Limit, Usage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import styles from "./session.module.css";

/*
 * The status line's numbers in the drawer: context and plan-limit pills, shown exactly
 * as the last payload had them, and a prompt cache ring that drains client-side towards `expiresAt`.
 * Home's header shows the plan limits again as rings.
 */

/** statusline.sh's `format_remaining`: `3d4h`, `2h10m`, `45m`. */
function remaining(secs: number) {
  if (secs < 60) return "<1m";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d) return h ? `${d}d${h}h` : `${d}d`;
  if (h) return m ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

function tokens(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

const UNIT = { s: 1, m: 60, h: 3600 } as const;

function ttlSeconds(ttl: string | null | undefined) {
  const m = /^(\d+)([smh])$/.exec(ttl ?? "");
  return m ? Number(m[1]) * UNIT[m[2] as keyof typeof UNIT] : null;
}

/**
 * Time until `limit` hits 100% at the window's average pace so far, even past the reset.
 * None at 0% (no pace yet) or 100%.
 * Linear extrapolation, so a burst early in the window overstates the burn.
 */
function forecast(limit: Limit, windowSecs: number, at: number) {
  if (!limit || limit.resetsAt == null) return undefined;
  const left = limit.resetsAt - at;
  const elapsed = windowSecs - left;
  if (left <= 0 || elapsed <= 0 || limit.pct <= 0 || limit.pct >= 100) return undefined;
  return `~${remaining(((100 - limit.pct) * elapsed) / limit.pct)}`;
}

function Pill({ label, pct, reset, tip }: { label: string; pct: number | null; reset?: string; tip?: string }) {
  if (pct == null) {
    return (
      <span className={cn(styles.pill, styles.pillDash)}>
        {label} <b>–</b>
      </span>
    );
  }
  const tone = pct <= 50 ? null : pct <= 75 ? styles.pillWarn : styles.pillBad;
  return (
    <span
      className={cn(styles.pill, tone, tip && styles.tipped)}
      style={{ "--pct": `${Math.min(pct, 100)}%` } as React.CSSProperties}
      tabIndex={tip ? 0 : undefined}
    >
      {label} <b>{Math.round(pct)}%</b>
      {reset ? <small>{reset}</small> : null}
      {tip ? <span className={styles.tip}>{tip}</span> : null}
    </span>
  );
}

const FIVE_HOURS = 5 * 3600;
const SEVEN_DAYS = 7 * 86400;

/** Context, 5h and 7d; `compact` (the phone strip, itself a button) shortens the label and drops reset times and tips. */
export function UsagePills({ usage, compact = false, className }: { usage: Usage | null; compact?: boolean; className?: string }) {
  const reset = (l: Limit) =>
    !compact && usage && l?.resetsAt != null && l.resetsAt > usage.at ? remaining(l.resetsAt - usage.at) : undefined;
  const tip = (l: Limit, windowSecs: number) => (!compact && usage ? forecast(l, windowSecs, usage.at) : undefined);
  return (
    <span className={cn(styles.pills, compact && styles.pillsCompact, className)} aria-label="Claude usage">
      <Pill label={compact ? "ctx" : "Context"} pct={usage?.context ?? null} />
      <Pill
        label="5h"
        pct={usage?.fiveHour?.pct ?? null}
        reset={reset(usage?.fiveHour ?? null)}
        tip={tip(usage?.fiveHour ?? null, FIVE_HOURS)}
      />
      <Pill
        label="7d"
        pct={usage?.sevenDay?.pct ?? null}
        reset={reset(usage?.sevenDay ?? null)}
        tip={tip(usage?.sevenDay ?? null, SEVEN_DAYS)}
      />
    </span>
  );
}

/** Prompt cache time left as a draining ring; once cold, the tokens the next message re-caches. `compact` drops the tip. */
export function CacheRing({ usage, compact = false }: { usage: Usage | null; compact?: boolean }) {
  const cache = usage?.cache;
  const [now, setNow] = React.useState(() => Date.now() / 1000);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 10_000);
    return () => clearInterval(timer);
  }, []);

  if (!cache) {
    return (
      <span className={styles.cache}>
        <Ring className={styles.ringCold} label="Prompt cache: no data yet" />
      </span>
    );
  }

  const left = cache.expiresAt != null ? cache.expiresAt - now : 0;
  if (!cache.warm || left <= 0) {
    const cost = cache.recacheTokens != null ? tokens(cache.recacheTokens) : null;
    return (
      <span className={styles.cache}>
        <Ring
          className={styles.ringCold}
          label={cost ? `Prompt cache cold · next message re-caches ${cost} tokens` : "Prompt cache cold"}
          tip={compact ? undefined : (cost ?? undefined)}
        />
      </span>
    );
  }

  const ttl = ttlSeconds(cache.ttl);
  const frac = ttl ? Math.min(left / ttl, 1) : 1;
  const tone = frac > 0.25 ? null : frac > 0.1 ? styles.ringWarn : styles.ringBad;
  const time = remaining(left);
  return (
    <span className={styles.cache}>
      <Ring className={tone} pct={frac * 100} label={`Prompt cache warm · ${time} left`} tip={compact ? undefined : time} />
    </span>
  );
}

/** The pills' tones: over 50 warn, over 75 bad. */
const toneLevel = (pct: number) => (pct <= 50 ? 0 : pct <= 75 ? 1 : 2);
const toneOf = (pct: number) => [null, styles.ringWarn, styles.ringBad][toneLevel(pct)];
const PROJ_TONE = ["ok", "warn", "bad"];

/**
 * Where `limit` will stand at its reset at the window's average pace so far, capped at 100. None at 0% (no pace
 * yet) or without a reset time. Linear, like `forecast`.
 */
function projected(limit: NonNullable<Limit>, windowSecs: number, at: number) {
  if (limit.resetsAt == null) return undefined;
  const elapsed = windowSecs - (limit.resetsAt - at);
  if (elapsed <= 0 || limit.pct <= 0) return undefined;
  return Math.min((limit.pct * windowSecs) / elapsed, 100);
}

function LimitRing({ name, limit, windowSecs, at }: { name: string; limit: Limit; windowSecs: number; at: number }) {
  const text = (value: string) => (
    <span className={styles.limitText}>
      <b>{value}</b>
      <small>{name}</small>
    </span>
  );
  if (!limit) {
    return (
      <Ring className={styles.ringCold} wrapClassName={styles.limit} label={`${name} limit: no data yet`} tip="No data yet">
        {text("–")}
      </Ring>
    );
  }
  // Past its reset, the last payload's percentage no longer holds.
  const reset = limit.resetsAt != null && limit.resetsAt <= at;
  const pct = reset ? 0 : Math.min(limit.pct, 100);
  const proj = reset ? undefined : projected(limit, windowSecs, at);
  const tip = reset ? "Reset" : limit.resetsAt != null ? `Resets ${remaining(limit.resetsAt - at)}` : undefined;
  const label = [`${name} limit ${Math.round(pct)}% used`, proj != null && `~${Math.round(proj)}% by reset`, tip].filter(Boolean).join(" · ");
  return (
    <Ring
      className={toneOf(pct)}
      wrapClassName={styles.limit}
      pct={pct}
      vars={proj == null ? undefined : { "--proj": `${proj}%`, "--proj-tone": `var(--${PROJ_TONE[toneLevel(proj)]})` }}
      label={label}
      tip={tip}
    >
      {text(`${Math.round(pct)}%`)}
    </Ring>
  );
}

/** Home's 5h and 7d limits as rings, from `seed` and then the hub's account-wide `limits` events. */
export function UsageRings({ seed }: { seed: Usage | null }) {
  const [state, setState] = React.useState({ seed, usage: seed });
  // A refresh that brings the server's copy starts from it.
  if (state.seed !== seed) setState({ seed, usage: seed });
  const { usage } = state;
  // Null until the first tick, so the server's and the browser's first render agree.
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(
    () =>
      subscribeLive((e) => {
        if (e.type === "limits") setState((s) => ({ ...s, usage: e.usage }));
      }),
    [],
  );
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 30_000);
    return () => clearInterval(timer);
  }, []);

  const at = Math.max(usage?.at ?? 0, now ?? 0);
  return (
    <span className={styles.limits} aria-label="Claude usage limits">
      <LimitRing name="5h" limit={usage?.fiveHour ?? null} windowSecs={FIVE_HOURS} at={at} />
      <LimitRing name="7d" limit={usage?.sevenDay ?? null} windowSecs={SEVEN_DAYS} at={at} />
    </span>
  );
}

/** With `tip`, focusable so keyboard users see it too. `children` sit beside the ring. */
function Ring({
  className,
  wrapClassName,
  pct,
  vars,
  label,
  tip,
  children,
}: {
  className?: string | null;
  wrapClassName?: string;
  pct?: number;
  /** More custom properties for the ring. */
  vars?: Record<string, string>;
  label: string;
  tip?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={cn(styles.ringWrap, styles.tipped, wrapClassName)} tabIndex={tip ? 0 : undefined} role="img" aria-label={label}>
      <span
        className={cn(styles.ring, className)}
        style={(pct == null ? vars : { "--pct": `${pct}%`, ...vars }) as React.CSSProperties}
      />
      {children}
      {tip ? (
        <span className={styles.tip} aria-hidden>
          {tip}
        </span>
      ) : null}
    </span>
  );
}
