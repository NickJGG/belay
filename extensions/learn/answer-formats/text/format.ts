import type { AnswerFormat } from '../types.ts';

/** Plain text, Markdown and code: Claude reads the file itself. */
export const text: AnswerFormat = {
  id: 'text',
  label: 'Text',
  extensions: [],
  icon: 'file-code',
};

export function textIcon(path: string): string {
  if (path.endsWith('.md')) return 'file-text';
  if (path.endsWith('.txt')) return 'file';
  return 'file-code';
}
