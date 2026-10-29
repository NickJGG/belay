"use client";

import * as React from "react";
import { setExtensionOn } from "@/app/actions";
import belay from "@/components/belay/belay.module.css";
import { setGlow, useGlow } from "@/components/layout/ambient-glow";
import { useMountedTheme } from "@/components/layout/rail";
import { CLIENT_SLOTS } from "@/lib/extensions.client";
import { extensionCard, glowRow, type ExtensionState } from "@/lib/settings";
import type { ClientSlots } from "@/lib/slots";
import { cn } from "@/lib/utils";
import styles from "./settings.module.css";

/** An Off/On switch: belay's segmented control. A disabled `off` (a locked Off) can't be pressed. */
function Switch({
  on,
  label,
  onChange,
  disabled,
  offDisabled,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  offDisabled?: boolean;
}) {
  const lockOff = disabled || offDisabled;
  const pick = (next: boolean) => () => {
    if (next !== on) onChange(next);
  };
  return (
    <div className={cn(belay.seg, styles.seg)} role="group" aria-label={label}>
      <button type="button" aria-pressed={!on} disabled={lockOff} aria-disabled={offDisabled || undefined} onClick={pick(false)}>
        Off
      </button>
      <button type="button" aria-pressed={on} disabled={disabled} onClick={pick(true)}>
        On
      </button>
    </div>
  );
}

function Glow() {
  const glow = useGlow();
  const { disabled, what } = glowRow(useMountedTheme());
  return (
    <div className={cn(styles.row, disabled && styles.rowOff)}>
      <div>
        <div className={styles.name}>Glow</div>
        <div className={styles.what}>{what}</div>
      </div>
      <Switch on={glow} label="Glow" onChange={setGlow} disabled={disabled} />
    </div>
  );
}

function ExtensionCard({ slots, state }: { slots: ClientSlots; state: ExtensionState }) {
  const [pending, start] = React.useTransition();
  const [on, setOn] = React.useOptimistic(state.on);
  const [error, setError] = React.useState<string>();
  const { locked, inUse } = extensionCard(state);
  const { Mark } = slots;
  const change = (next: boolean) =>
    start(async () => {
      setOn(next);
      setError((await setExtensionOn(state.id, next))?.error);
    });
  return (
    <li className={cn(styles.card, !on && styles.cardOff)}>
      <div className={styles.top}>
        <span className={styles.tile}>
          <Mark tone={on ? "brand" : "current"} className={styles.mark} />
        </span>
        <span className={styles.name}>{slots.name}</span>
        <Switch on={on} label={slots.name} onChange={change} disabled={pending} offDisabled={locked} />
      </div>
      <div className={styles.what}>{slots.summary}</div>
      {inUse.length ? (
        <div className={styles.why}>
          In use by{" "}
          {inUse.map((slug, i) => (
            <React.Fragment key={slug}>
              {i ? ", " : null}
              <code>{slug}</code>
            </React.Fragment>
          ))}
          . Switch it off once that detaches.
        </div>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}
    </li>
  );
}

/** Settings: Appearance (Glow, kept per browser), then a card per built-in Extension, active or not, with its switch. */
export function Settings({ extensions }: { extensions: ExtensionState[] }) {
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
          {CLIENT_SLOTS.map((s) => (
            <ExtensionCard key={s.id} slots={s} state={extensions.find((e) => e.id === s.id)!} />
          ))}
        </ul>
        <p className={styles.note}>Off hides its pages, nav, search and Tabs. Its data and Claude Code skills stay.</p>
      </section>
    </div>
  );
}
