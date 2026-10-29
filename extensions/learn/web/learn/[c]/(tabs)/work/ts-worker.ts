/** The TypeScript language service for the Work editor's .ts/.js files, off the main thread. See `ts-editor.ts`. */
import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";
import { createWorker } from "@valtown/codemirror-ts/worker";
import * as Comlink from "comlink";
import ts from "typescript";
import { compilerOptions } from "../../../../_lib/ts-env";

const base = createWorker(async () => {
  const files: Record<string, string> = await (await fetch(`/api/work/ts-env?v=${ts.version}`)).json();
  return createVirtualTypeScriptEnvironment(createSystem(new Map(Object.entries(files))), [], ts, compilerOptions(ts));
});

const api = {
  ...base,
  // codemirror-ts's own lints drop the TS code and all but the first line of a chained message.
  getLints({ path }: { path: string }) {
    const env = base.getEnv();
    if (!env?.getSourceFile(path)) return [];
    const { languageService } = env;
    return [...languageService.getSyntacticDiagnostics(path), ...languageService.getSemanticDiagnostics(path)]
      .filter((d) => d.start !== undefined && d.length !== undefined)
      .map((d) => ({
        from: d.start!,
        to: d.start! + d.length!,
        severity: d.category === ts.DiagnosticCategory.Error ? "error" : d.category === ts.DiagnosticCategory.Warning ? "warning" : "info",
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        source: `TS${d.code}`,
      }) as const);
  },
};

export type TsWorker = typeof api;

Comlink.expose(api);
