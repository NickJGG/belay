"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { changeExtensionInstall, extensionJob, setExtensionOn } from "@/app/actions";
import { Confirm } from "@/components/belay/controls";
import { setGlow, useGlow } from "@/components/layout/ambient-glow";
import { StrokeMark } from "@/components/layout/logo";
import { useMountedTheme } from "@/components/layout/rail";
import { Button } from "@/components/ui/button";
import { extensionCard, glowRow, jobIdle, jobLine, type ExtensionJob, type ExtensionState } from "@/lib/settings";
import { cn } from "@/lib/utils";
import styles from "./settings.module.css";

/** A sliding On/Off switch. Disabled, it's greyed: Glow in light, or an extension's locked Off. */
function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={styles.switch} onClick={() => onChange(!on)}>
      <span className={styles.knob} />
    </button>
  );
}

function Glow() {
  const glow = useGlow();
  const { disabled, what } = glowRow(useMountedTheme());
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.name}>Glow</div>
        <div className={styles.what}>{what}</div>
      </div>
      <Switch on={glow} label="Glow" onChange={setGlow} disabled={disabled} />
    </div>
  );
}

/**
 * Follows a job: polls its progress while it runs, then reloads the page, waiting under `belay serve` until the
 * rebuilt server (a new `/api/boot`) answers.
 */
function useJob(initial: ExtensionJob | null): [ExtensionJob | null, (job: ExtensionJob) => void] {
  const [job, setJob] = React.useState(initial);
  const [waiting, setWaiting] = React.useState(false);
  const running = job?.state === "running";
  const restarting = waiting || (job?.state === "done" && job.restarting);
  const boot = job?.boot;

  React.useEffect(() => {
    if (!running || waiting) return;
    const t = setInterval(() => {
      extensionJob().then(
        (j) => j && setJob(j),
        // The server went away mid-job: wait for it to come back.
        () => setWaiting(true),
      );
    }, 600);
    return () => clearInterval(t);
  }, [running, waiting]);

  React.useEffect(() => {
    if (job?.state === "done" && !job.restarting) {
      const t = setTimeout(() => location.reload(), 800);
      return () => clearTimeout(t);
    }
  }, [job]);

  React.useEffect(() => {
    if (!restarting) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/boot", { cache: "no-store" });
        if (res.ok && (await res.json()).boot !== boot) location.reload();
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [restarting, boot]);

  return [job, setJob];
}

function ExtensionCard({ state, job, busy, onStart }: { state: ExtensionState; job: ExtensionJob | null; busy: boolean; onStart: (job: ExtensionJob) => void }) {
  const [pending, start] = React.useTransition();
  const [on, setOn] = React.useOptimistic(state.on);
  const [error, setError] = React.useState<string>();
  const [confirming, setConfirming] = React.useState(false);
  const { installed, locked, canUninstall, inUse, then } = extensionCard(state);
  const lit = installed && on;
  const change = (next: boolean) =>
    start(async () => {
      setOn(next);
      setError((await setExtensionOn(state.id, next))?.error);
    });
  const install = (yes: boolean) =>
    start(async () => {
      setError(undefined);
      const err = (await changeExtensionInstall(state.id, yes))?.error;
      setConfirming(false);
      if (err) return setError(err);
      onStart({ id: state.id, action: yes ? "install" : "uninstall", boot: "", state: "running", step: yes ? "dependencies" : "record", n: 1, of: 4 });
    });
  return (
    <li className={cn(styles.card, !lit && styles.cardOff)}>
      <div className={styles.top}>
        <span className={styles.tile}>
          <StrokeMark path={state.mark.path} dot={state.mark.dot} tone={lit ? "brand" : "current"} className={styles.mark} />
        </span>
        <span className={styles.name}>{state.name}</span>
        {installed ? (
          <Switch on={on} label={state.name} onChange={change} disabled={pending || (on && locked)} />
        ) : (
          <span className={styles.badge}>Not installed</span>
        )}
      </div>
      <div className={styles.what}>{state.summary}</div>
      {inUse.length ? (
        <div className={styles.why}>
          In use by{" "}
          {inUse.map((slug, i) => (
            <React.Fragment key={slug}>
              {i ? ", " : null}
              <code>{slug}</code>
            </React.Fragment>
          ))}
          . {then}
        </div>
      ) : null}
      {job ? (
        <div className={cn(styles.job, job.state === "failed" && styles.error)}>
          {job.state === "done" ? <Info size={14} aria-hidden className={styles.info} /> : null}
          {jobLine(job)}
        </div>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.foot}>
        {installed ? (
          <Button variant="ghost" size="sm" disabled={busy || pending || !canUninstall} onClick={() => setConfirming(true)}>
            Uninstall
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={busy || pending} onClick={() => install(true)}>
            Install
          </Button>
        )}
      </div>
      <Confirm open={confirming} onClose={() => setConfirming(false)} title={`Uninstall ${state.name}?`} action="Uninstall" pending={pending} onConfirm={() => install(false)}>
        Its pages, nav, search, Tabs and Claude Code plugin go, and Belay rebuilds. Its data and its setting stay, so installing
        it again brings it all back.
      </Confirm>
    </li>
  );
}

/**
 * Settings: Appearance (Glow, kept per browser), then a card per bundled Extension: an installed one with its switch
 * and Uninstall, an uninstalled one with Install. `job` is an install or uninstall still in progress.
 */
export function Settings({ extensions, job: initial }: { extensions: ExtensionState[]; job: ExtensionJob | null }) {
  const [job, setJob] = useJob(initial);
  const busy = !jobIdle(job);
  return (
    <div className={styles.body}>
      <section>
        <h2 className={styles.head}>Appearance</h2>
        <Glow />
        <p className={styles.note}>Saved in this browser.</p>
      </section>
      <section>
        <h2 className={styles.head}>Extensions</h2>
        <ul className={styles.cards}>
          {extensions.map((s) => (
            <ExtensionCard key={s.id} state={s} job={job?.id === s.id ? job : null} busy={busy} onStart={setJob} />
          ))}
        </ul>
        <p className={styles.note}>
          <Info size={14} aria-hidden className={styles.info} />
          Off hides its pages, nav, search and Tabs. Its data and Claude Code skills stay.
        </p>
      </section>
    </div>
  );
}
