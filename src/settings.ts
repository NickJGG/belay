/**
 * Dashboard display preferences in `<data dir>/settings.yaml`. `setSettings` (ops.ts) accepts only `ACCENT_KEYS`;
 * loading takes any name, so a hand-edited file falls back in `web/` (which owns the colours) instead of failing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { writeAtomic } from './store.ts';

export const THEMES = ['system', 'dark', 'light'] as const;

export type Theme = (typeof THEMES)[number];

export const ACCENT_KEYS = [
  'amber',
  'tangerine',
  'coral',
  'crimson',
  'rose',
  'magenta',
  'iris',
  'azure',
  'cyan',
  'teal',
  'jade',
  'lime',
  'citron',
  'copper',
  'steel',
  'sand',
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

export interface Settings {
  accent: string;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = { accent: 'coral', theme: 'system' };

export function settingsFile(dir: string): string {
  return join(dir, 'settings.yaml');
}

function validate(s: Record<string, unknown>): Settings {
  const accent = s.accent ?? DEFAULT_SETTINGS.accent;
  const theme = s.theme ?? DEFAULT_SETTINGS.theme;
  if (typeof accent !== 'string' || !accent.trim()) throw new Error(`settings.yaml: 'accent' must be a non-empty string`);
  if (!THEMES.includes(theme as Theme)) {
    throw new Error(`settings.yaml: 'theme' must be one of ${THEMES.join('|')} (got ${JSON.stringify(theme)})`);
  }
  return { accent: accent.trim(), theme: theme as Theme };
}

export function loadSettings(dir: string): Settings {
  const file = settingsFile(dir);
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS };
  const data = parse(readFileSync(file, 'utf8')) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.yaml: not a mapping');
  return validate(data);
}

export function saveSettings(dir: string, s: Settings): void {
  const { accent, theme } = validate({ ...s });
  writeAtomic(settingsFile(dir), stringify({ accent, theme }));
}
