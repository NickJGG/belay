'use client';
/**
 * An editable combobox that picks issues into a list of chips (the WAI-ARIA APG pattern, like
 * `Dropdown`): focus stays in the input while the list tracks its active option through
 * aria-activedescendant.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { pickerOptions } from '../../src/picker.ts';
import { Chip, type Ref } from './Chip';
import { StatusIcon } from './StatusIcon';
import list from './Dropdown.module.css';
import styles from './IssuePicker.module.css';

export function IssuePicker({
  label,
  value,
  onChange,
  candidates,
  preferProject,
  link,
  disabled,
}: {
  label: string;
  value: Ref[];
  onChange: (ids: string[]) => void;
  candidates: Ref[];
  preferProject?: string;
  /** Passed to each `Chip`. */
  link?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const ul = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ids = value.map((r) => r.id);
  const options = open ? pickerOptions(candidates, query, { exclude: ids, preferProject }) : [];
  const shown = options.length > 0;

  useEffect(() => {
    if (shown) ul.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [shown, active]);

  const show = () => {
    setActive(0);
    setOpen(true);
  };
  const add = (r: Ref) => {
    onChange([...ids, r.id]);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown') {
      if (!open) show();
      else setActive(Math.min(active + 1, options.length - 1));
    } else if (e.key === 'ArrowUp' && shown) setActive(Math.max(active - 1, 0));
    else if (e.key === 'Enter' && shown) add(options[Math.min(active, options.length - 1)]);
    else if (e.key === 'Escape' && shown) setOpen(false);
    else if (e.key === 'Backspace' && !query && ids.length) onChange(ids.slice(0, -1));
    else return;
    e.preventDefault();
  };

  return (
    <div className={styles.picker}>
      {value.map((r) => (
        <Chip key={r.id} r={r} link={link} onRemove={disabled ? undefined : () => onChange(ids.filter((x) => x !== r.id))} />
      ))}
      <div className={list.wrap}>
        <input
          role="combobox"
          className={styles.input}
          placeholder="Add…"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown ? `${id}-list` : undefined}
          aria-activedescendant={shown ? `${id}-${active}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            show();
          }}
          onClick={show}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
        {shown && (
          // mousedown would blur the input and close the list before the click lands.
          <ul ref={ul} id={`${id}-list`} role="listbox" aria-label={label} className={`${list.list} ${styles.list}`} onMouseDown={(e) => e.preventDefault()}>
            {options.map((r, i) => (
              <li
                key={r.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? list.active : list.option}
                onMouseMove={() => setActive(i)}
                onClick={() => add(r)}
              >
                {r.status && <StatusIcon status={r.status} size={12} />}
                <span className={styles.id}>{r.id}</span>
                <span className={styles.title}>{r.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
