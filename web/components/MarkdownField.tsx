'use client';
import { useState } from 'react';
import { Markdown } from './Markdown';
import ui from './ui.module.css';
import styles from './MarkdownField.module.css';

/** A Markdown textarea with Write/Preview tabs. It grows with its content from `minRows`. */
export function MarkdownField({
  value,
  onChange,
  onKeyDown,
  minRows,
  label = 'Description',
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  minRows: number;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className={styles.field}>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={!preview} className={styles.tab} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={preview} className={styles.tab} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      {preview ? (
        <div className={styles.preview}>{value.trim() ? <Markdown>{value}</Markdown> : <span className={ui.muted}>Nothing to preview.</span>}</div>
      ) : (
        <textarea
          className={styles.textarea}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.max(minRows, value.split('\n').length + 2)}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}
