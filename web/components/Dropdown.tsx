'use client';
/**
 * A select-only combobox (the WAI-ARIA APG pattern). Focus stays on the trigger, and the open list
 * tracks its active option through aria-activedescendant. Handled keys are preventDefault-ed, which
 * keeps them from the global key layer.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import styles from './Dropdown.module.css';

export type Option = [value: string, label: string];

export function Dropdown({
  label,
  value,
  options,
  onChange,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  /** Shown while `value` matches no option. */
  placeholder?: string;
}) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = options.findIndex(([v]) => v === value);

  const show = () => {
    setActive(Math.max(0, current));
    setOpen(true);
  };
  const pick = (i: number) => {
    setOpen(false);
    if (options[i][0] !== value) onChange(options[i][0]);
  };

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // Safari doesn't focus a clicked button, so blur alone can't be relied on to close.
  useEffect(() => {
    if (!open) return;
    const listener = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', listener);
    return () => document.removeEventListener('pointerdown', listener);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const last = options.length - 1;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') show();
      else return;
    } else if (e.key === 'ArrowDown') setActive(Math.min(active + 1, last));
    else if (e.key === 'ArrowUp') setActive(Math.max(active - 1, 0));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const order = options.map((_, i) => (active + 1 + i) % options.length);
      const hit = order.find((i) => options[i][1].toLowerCase().startsWith(k));
      if (hit !== undefined) setActive(hit);
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={wrap} className={styles.wrap}>
      <button
        type="button"
        role="combobox"
        className={className}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        {current >= 0 ? options[current][1] : <span className={styles.placeholder}>{placeholder}</span>}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        // mousedown would blur the trigger and close the list before the click lands.
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className={styles.list} onMouseDown={(e) => e.preventDefault()}>
          {options.map(([v, l], i) => (
            <li
              key={v}
              id={`${id}-${i}`}
              role="option"
              aria-selected={v === value}
              className={i === active ? styles.active : styles.option}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className={styles.label}>{l}</span>
              {v === value && <Check size={12} className={styles.check} aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
