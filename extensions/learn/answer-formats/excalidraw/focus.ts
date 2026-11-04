import { analyze } from './summarize.ts';
import { parseScene } from './scene.ts';

/** The summary lines about one element: a box with its arrows, or an arrow with its ends. A label stands for what it labels. */
export function focus(text: string, elementId: string): string[] {
  const a = analyze(parseScene(text), '');
  const id = a.labelOf.get(elementId) ?? elementId;
  const box = a.boxes.find((b) => b.id === id);
  if (box) return [box.line, ...a.arrows.filter((r) => r.ends.includes(id)).map((r) => r.line)];
  const arrow = a.arrows.find((r) => r.id === id);
  if (arrow) return [arrow.line, ...a.boxes.filter((b) => arrow.ends.includes(b.id)).map((b) => b.line)];
  const other = [...a.notes, ...a.frames, ...a.unreadable].find((l) => l.id === id);
  return other ? [other.line] : [];
}
