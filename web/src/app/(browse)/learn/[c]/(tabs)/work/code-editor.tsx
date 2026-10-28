"use client";

import * as React from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { indentWithTab } from "@codemirror/commands";
import { editorTheme, highlightStyle, loadFileLanguage } from "@/components/content/syntax";

export type CodeEditorHandle = {
  /** Replaces the whole document, e.g. after reloading from disk. */
  setDoc: (text: string) => void;
};

// Markdown and Python's indent are known up front; other languages load into `lang` once fetched.
function fileSetup(path: string): Extension {
  if (path.endsWith(".py")) return indentUnit.of("    ");
  if (path.endsWith(".md")) return [markdown({ codeLanguages: languages }), EditorView.lineWrapping];
  return [];
}

export const CodeEditor = React.forwardRef<
  CodeEditorHandle,
  { path: string; initial: string; onChange: (text: string) => void; onBlur?: () => void; onSubmit?: () => void }
>(function CodeEditor({ path, initial, onChange, onBlur, onSubmit }, ref) {
  const host = React.useRef<HTMLDivElement>(null);
  const view = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onBlurRef = React.useRef(onBlur);
  const onSubmitRef = React.useRef(onSubmit);
  // Programmatic replacements aren't edits.
  const silent = React.useRef(false);

  React.useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onSubmitRef.current = onSubmit;
  });

  React.useImperativeHandle(ref, () => ({
    setDoc(text) {
      const v = view.current;
      if (!v || v.state.doc.toString() === text) return;
      silent.current = true;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
      silent.current = false;
    },
  }));

  // `initial` seeds the document once; later updates come through `setDoc`.
  React.useEffect(() => {
    const lang = new Compartment();
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          // Above basicSetup's Mod-Enter (insertBlankLine).
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  if (!onSubmitRef.current) return false;
                  onSubmitRef.current();
                  return true;
                },
              },
            ]),
          ),
          fileSetup(path),
          lang.of([]),
          editorTheme,
          syntaxHighlighting(highlightStyle),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !silent.current) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({ blur: () => void onBlurRef.current?.() }),
        ],
      }),
    });
    view.current = v;
    let live = true;
    if (!path.endsWith(".md")) {
      void loadFileLanguage(path).then((support) => {
        if (live && support) v.dispatch({ effects: lang.reconfigure(support) });
      });
    }
    return () => {
      live = false;
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return <div ref={host} style={{ height: "100%" }} />;
});
