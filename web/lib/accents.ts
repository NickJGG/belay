import { ACCENT_KEYS, DEFAULT_SETTINGS, type AccentKey } from '../../src/settings.ts';

/** Accent presets, each hand-tuned for the dark and light themes. `flag` warns of a clash with a fixed semantic color. */
export interface Accent {
  key: AccentKey;
  name: string;
  dark: string;
  light: string;
  flag?: string;
}

const COLORS: Record<AccentKey, Omit<Accent, 'key'>> = {
  amber: { name: 'Amber', dark: '#F2A93B', light: '#A9640A', flag: 'Close to the high-priority orange' },
  tangerine: { name: 'Tangerine', dark: '#FF8A4C', light: '#C8501A', flag: 'Clashes with the high-priority orange' },
  coral: { name: 'Coral', dark: '#FF7470', light: '#CC3F45' },
  crimson: { name: 'Crimson', dark: '#EE5560', light: '#BE2532', flag: 'Collides with destructive red' },
  rose: { name: 'Rose', dark: '#F06AA6', light: '#C2357A' },
  magenta: { name: 'Magenta', dark: '#D466E6', light: '#9E2FB3' },
  iris: { name: 'Iris', dark: '#8B86F5', light: '#5650D4', flag: "Linear's own color" },
  azure: { name: 'Azure', dark: '#56A3FF', light: '#1A66CC' },
  cyan: { name: 'Cyan', dark: '#36C6E3', light: '#077F9A' },
  teal: { name: 'Teal', dark: '#2DC9A8', light: '#0A7F69' },
  jade: { name: 'Jade', dark: '#45D18A', light: '#178246', flag: 'Hard to tell from done-green' },
  lime: { name: 'Lime', dark: '#A9D84A', light: '#557A08' },
  citron: { name: 'Citron', dark: '#E4D24E', light: '#7F7000' },
  copper: { name: 'Copper', dark: '#DD9468', light: '#9E5528' },
  steel: { name: 'Steel', dark: '#93A9CF', light: '#4A6188' },
  sand: { name: 'Sand', dark: '#CDB892', light: '#7D6840' },
};

export const ACCENTS: Accent[] = ACCENT_KEYS.map((key) => ({ key, ...COLORS[key] }));

/** Unknown names (a hand-edited settings.yaml) fall back to the default rather than failing the page. */
export function accent(key: string): Accent {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS.find((a) => a.key === DEFAULT_SETTINGS.accent)!;
}
