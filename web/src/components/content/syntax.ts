/** Syntax colours and languages shared by the Work editor and rendered code blocks. */
"use client";

import { HighlightStyle, LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { StyleModule } from "style-mod";

// Colours are the site's tokens, so the editor follows the theme toggle with no reconfigure.
export const editorTheme = EditorView.theme({
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

// VS Code's Dark+ / Light+ scopes, through the --syntax-* tokens. The most specific tag wins, so
// `t.function(t.variableName)` outranks `t.variableName`.
export const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.definitionKeyword, t.operatorKeyword, t.modifier, t.self, t.bool, t.null, t.atom, t.meta], color: "var(--syntax-keyword)" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "var(--syntax-control)" },
  { tag: [t.string, t.special(t.string), t.character, t.docString, t.attributeValue], color: "var(--syntax-string)" },
  { tag: t.regexp, color: "var(--syntax-regexp)" },
  { tag: [t.number, t.integer, t.float, t.unit], color: "var(--syntax-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--syntax-comment)" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName)), t.macroName],
    color: "var(--syntax-function)",
  },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName), t.definition(t.className)], color: "var(--syntax-type)" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--syntax-property)" },
  { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: "var(--syntax-variable)" },
  { tag: [t.operator, t.derefOperator], color: "var(--syntax-operator)" },
  { tag: t.tagName, color: "var(--syntax-tag)" },
  { tag: t.attributeName, color: "var(--syntax-attribute)" },
  { tag: t.heading, fontWeight: "700", color: "var(--syntax-keyword)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "var(--syntax-string)", textDecoration: "underline" },
  { tag: [t.monospace, t.processingInstruction], color: "var(--muted)" },
  { tag: t.invalid, color: "var(--bad)" },
]);

let mounted = false;

/** Adds the highlight style's CSS to the page, for code highlighted outside an editor. */
export function mountHighlightStyle() {
  if (mounted || !highlightStyle.module) return;
  StyleModule.mount(document, highlightStyle.module);
  mounted = true;
}

// `load()` caches per language, so each is fetched once.
async function load(desc: LanguageDescription | null): Promise<LanguageSupport | null> {
  return desc ? desc.load() : null;
}

/** The language for a file, by name or extension. */
export function loadFileLanguage(path: string) {
  return load(LanguageDescription.matchFilename(languages, path));
}

/** The language a fence's word names (see `fenceLanguage`): a name or alias (`ts`), else an extension (`py`). */
export function loadFenceLanguage(word: string) {
  return load(LanguageDescription.matchLanguageName(languages, word, false) ?? LanguageDescription.matchFilename(languages, `.${word}`));
}
