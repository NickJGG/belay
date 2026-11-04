import { excalidraw } from './excalidraw/format.ts';
import { text, textIcon } from './text/format.ts';
import type { AnswerFormat } from './types.ts';

export type { AnswerFormat, Summary, Warnings } from './types.ts';

/** Every answer format; `text` is the default for any extension no other one claims. */
export const ANSWER_FORMATS: readonly AnswerFormat[] = [text, excalidraw];

export function formatFor(path: string): AnswerFormat {
  const lower = path.toLowerCase();
  return ANSWER_FORMATS.find((f) => f.extensions.some((e) => lower.endsWith(e))) ?? text;
}

export function iconFor(path: string): string {
  const format = formatFor(path);
  return format === text ? textIcon(path.toLowerCase()) : format.icon;
}
