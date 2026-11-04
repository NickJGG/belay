import type { AnswerFormat } from '../types.ts';
import { focus } from './focus.ts';
import { summarize } from './summarize.ts';
import { write } from './write.ts';

export const excalidraw: AnswerFormat = {
  id: 'excalidraw',
  label: 'Diagram',
  extensions: ['.excalidraw'],
  icon: 'workflow',
  template: () =>
    `${JSON.stringify({ type: 'excalidraw', version: 2, source: 'belay', elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} }, null, 2)}\n`,
  summarize,
  focus,
  write,
};
