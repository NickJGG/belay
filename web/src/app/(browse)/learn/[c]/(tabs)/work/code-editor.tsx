"use client";

import * as React from "react";
import { basicSetup } from "codemirror";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { indentWithTab } from "@codemirror/commands";
import { tags as t } from "@lezer/highlight";

export type CodeEditorHandle = {
  /** Replaces the whole document, e.g. after reloading from disk. */
  setDoc: (text: string) => void;
};

// Colours are the site's tokens, so the editor follows the theme toggle with no reconfigure.
const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--text)", backgroundColor: "var(--panel)", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--text)", padding: "var(--space-3) 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "color-mix(in srgb, var(--text) 18%, transparent)" },
  ".cm-gutters": { backgroundColor: "var(--panel)", color: "var(--faint)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--accent-soft)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--muted)" },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--ok) 25%, transparent)", outline: "none" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--ok) 25%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--bg)", color: "var(--text)", borderColor: "var(--line)" },
  ".cm-tooltip": { backgroundColor: "var(--bg)", border: "1px solid var(--line)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--panel-hover)", border: "none", color: "var(--muted)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--ok)" },
  { tag: [t.string, t.special(t.string)], color: "color-mix(in srgb, var(--ok) 55%, var(--text))" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "color-mix(in srgb, var(--bad) 70%, var(--text))" },
  { tag: [t.comment, t.meta], color: "var(--faint)", fontStyle: "italic" },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], fontWeight: "600" },
  { tag: t.heading, fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "var(--ok)", textDecoration: "underline" },
  { tag: [t.monospace, t.processingInstruction], color: "var(--muted)" },
  { tag: t.invalid, color: "var(--bad)" },
]);

function language(path: string): Extension {
  if (path.endsWith(".py")) return [python(), indentUnit.of("    ")];
  if (path.endsWith(".md")) return [markdown(), EditorView.lineWrapping];
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
          language(path),
          theme,
          syntaxHighlighting(highlight),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !silent.current) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({ blur: () => void onBlurRef.current?.() }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return <div ref={host} style={{ height: "100%" }} />;
});
