/** Accent presets, each hand-tuned for the dark and light themes. `flag` warns of a clash with a fixed semantic color. */
export interface Accent {
  key: string;
  name: string;
  dark: string;
  light: string;
  flag?: string;
}

export const ACCENTS: Accent[] = [
  { key: 'amber', name: 'Amber', dark: '#F2A93B', light: '#A9640A', flag: 'Close to the high-priority orange' },
  { key: 'tangerine', name: 'Tangerine', dark: '#FF8A4C', light: '#C8501A', flag: 'Clashes with the high-priority orange' },
  { key: 'coral', name: 'Coral', dark: '#FF7470', light: '#CC3F45' },
  { key: 'crimson', name: 'Crimson', dark: '#EE5560', light: '#BE2532', flag: 'Collides with destructive red' },
  { key: 'rose', name: 'Rose', dark: '#F06AA6', light: '#C2357A' },
  { key: 'magenta', name: 'Magenta', dark: '#D466E6', light: '#9E2FB3' },
  { key: 'iris', name: 'Iris', dark: '#8B86F5', light: '#5650D4', flag: "Linear's own color" },
  { key: 'azure', name: 'Azure', dark: '#56A3FF', light: '#1A66CC' },
  { key: 'cyan', name: 'Cyan', dark: '#36C6E3', light: '#077F9A' },
  { key: 'teal', name: 'Teal', dark: '#2DC9A8', light: '#0A7F69' },
  { key: 'jade', name: 'Jade', dark: '#45D18A', light: '#178246', flag: 'Hard to tell from done-green' },
  { key: 'lime', name: 'Lime', dark: '#A9D84A', light: '#557A08' },
  { key: 'citron', name: 'Citron', dark: '#E4D24E', light: '#7F7000' },
  { key: 'copper', name: 'Copper', dark: '#DD9468', light: '#9E5528' },
  { key: 'steel', name: 'Steel', dark: '#93A9CF', light: '#4A6188' },
  { key: 'sand', name: 'Sand', dark: '#CDB892', light: '#7D6840' },
];

export const DEFAULT_ACCENT = 'coral';

/** Unknown names (a hand-edited settings.yaml) fall back to the default rather than failing the page. */
export function accent(key: string): Accent {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS.find((a) => a.key === DEFAULT_ACCENT)!;
}

export function isAccent(key: string): boolean {
  return ACCENTS.some((a) => a.key === key);
}
