/**
 * Squiggles, hover types and autocomplete for .ts/.js files in the Work editor, from `ts-worker.ts`. Loaded with a
 * dynamic import only when such a file opens; one worker serves every editor, files keyed by their work/ path.
 */
import { autocompletion } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { hoverTooltip, ViewPlugin } from "@codemirror/view";
import * as Comlink from "comlink";
import type { TsWorker } from "./ts-worker";

let worker: Promise<Comlink.Remote<TsWorker>> | null = null;

function tsWorker() {
  worker ??= (async () => {
    const remote = Comlink.wrap<TsWorker>(new Worker(new URL("./ts-worker.ts", import.meta.url), { type: "module" }));
    await remote.initialize();
    return remote;
  })();
  return worker;
}

/** Resolves once the worker has its environment. The file syncs from when the extensions mount. */
export async function tsExtensions(path: string): Promise<Extension> {
  const w = await tsWorker();
  const file = `/${path}`;
  // Comlink keeps call order, so each sync lands before the lint or hover that follows it.
  const sync = (code: string) => void w.updateFile({ path: file, code });
  return [
    ViewPlugin.define((view) => {
      sync(view.state.doc.toString());
      return { update: (u) => void (u.docChanged && sync(u.state.doc.toString())) };
    }),
    linter(() => w.getLints({ path: file })),
    hoverTooltip(async (_view, pos) => {
      const info = await w.getHover({ path: file, pos });
      if (!info?.quickInfo) return null;
      const { displayParts = [], documentation = [] } = info.quickInfo;
      return {
        pos: info.start,
        end: info.end,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "cm-ts-hover";
          const sig = dom.appendChild(document.createElement("code"));
          for (const part of displayParts) {
            const span = sig.appendChild(document.createElement("span"));
            span.className = `cm-ts-${part.kind}`;
            span.textContent = part.text;
          }
          const docs = documentation.map((d) => d.text).join("");
          if (docs) dom.appendChild(document.createElement("p")).textContent = docs;
          return { dom };
        },
      };
    }),
    autocompletion({ override: [(context) => w.getAutocompletion({ path: file, context: { pos: context.pos, explicit: context.explicit } })] }),
  ];
}
