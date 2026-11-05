import { File, FileCode, FileText, Workflow, type LucideIcon } from "lucide-react";

/** The lucide components behind `AnswerFormat.icon` and `iconFor` names. */
const ICONS: Record<string, LucideIcon> = { workflow: Workflow, "file-text": FileText, file: File, "file-code": FileCode };

export function FormatIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? File;
  return <Icon size={size} aria-hidden />;
}
