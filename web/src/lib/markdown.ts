import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { visit, SKIP } from "unist-util-visit";
import type { Root as HastRoot } from "hast";
import type { Root, Parent, PhrasingContent, Text } from "mdast";
import { MarkdownLink } from "@/components/content/markdown-link";
import { Mermaid } from "@/components/content/mermaid";
import { CodeBlock } from "@/components/content/code-block";
import { codeBlockNode } from "./code-fence";
import type { TopicStatus } from "./courses";
import { resolveWikiTarget } from "./wiki-target";

/*
 * Markdown → React: GFM, KaTeX math, and ```mermaid blocks and highlighted code blocks drawn client-side. Raw HTML is dropped, as remark-rehype
 * does by default. Runs on both sides: course and legacy pages on the server, the drawer in the browser.
 *
 * Given a course, its Obsidian syntax is lifted out of the raw text before parsing (so `$`, `\(` and `*` inside
 * quotes and link targets survive) and put back as tokens:
 *   [[sources/x]] "quote"  → source chip with the quote on hover
 *   [[path]] [[path#^cN]] [[path|alias]] → site link (block refs become #cN anchors)
 *   [k:topic^cN]           → claim chip linking to that claim (plain text when `claims` is false)
 *   trailing ^cN           → id="cN" on its paragraph or list item
 * and Mermaid topic nodes are coloured by syllabus status.
 */

export type MarkdownContext = {
  course: string;
  /** Topic statuses for colouring Mermaid nodes; `href` makes the node clickable. */
  topics?: Record<string, { status: TopicStatus; href?: string }>;
  /** Render claim citations as chips (default); false during an open checkpoint. */
  claims?: boolean;
};

type Token =
  | { kind: "cite"; source: string; quote: string }
  | { kind: "link"; target: string; alias: string | null }
  | { kind: "claim"; topic: string; id: string }
  | { kind: "block"; id: string };

const OPEN = "\u{E000}";
const CLOSE = "\u{E001}";
const TOKEN = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");

const CITE = /\[\[(sources\/[^\]|#]+)(?:\|[^\]]*)?\]\]\s*"([^"\n]*)"/g;
const CLAIM = /\[k:([a-z0-9][a-z0-9-]*)\^(c\d+)\]/g;
const WIKI = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g;
const BLOCK = /[ \t]\^(c\d+)[ \t]*$/gm;
// Fenced blocks and inline code spans, matched left to right so backticks pair up.
const VERBATIM = /^(```|~~~)[\s\S]*?^\1[ \t]*$|(`+)[^\n]*?\2/gm;

function liftObsidian(md: string, tokens: Token[]): string {
  const put = (t: Token) => `${OPEN}${tokens.push(t) - 1}${CLOSE}`;
  const lift = (s: string) =>
    s
      .replace(CITE, (_, source, quote) => put({ kind: "cite", source, quote }))
      .replace(CLAIM, (_, topic, id) => put({ kind: "claim", topic, id }))
      .replace(WIKI, (_, target, alias) => put({ kind: "link", target: target.trim(), alias: alias?.trim() ?? null }))
      .replace(BLOCK, (_, id) => put({ kind: "block", id }));
  let out = "";
  let last = 0;
  for (const m of md.matchAll(VERBATIM)) {
    // Inline code is only shielded when it holds `[[` (a nested list literal) or `[k:`; otherwise
    // a quote containing code must stay whole for CITE.
    if (!m[1] && !m[0].includes("[[") && !m[0].includes("[k:")) continue;
    out += lift(md.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + lift(md.slice(last));
}

/** A text fragment for the quote, up to its first ellipsis; browsers ignore it if it misses. */
function quoteFragment(quote: string): string {
  const head = quote.split(/…|\.\.\./)[0].trim().split(/\s+/).slice(0, 8).join(" ");
  return head ? `#:~:text=${encodeURIComponent(head)}` : "";
}

function restoreObsidian(tokens: Token[], ctx: MarkdownContext) {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined || !node.value.includes(OPEN)) return;
      const out: PhrasingContent[] = [];
      let last = 0;
      let block = false;
      for (const m of node.value.matchAll(TOKEN)) {
        if (m.index > last) out.push({ type: "text", value: node.value.slice(last, m.index) });
        last = m.index + m[0].length;
        const t = tokens[+m[1]];
        block = t.kind === "block";
        if (t.kind === "block") {
          const holder = parent.type === "paragraph" ? parent : null;
          if (holder) (holder.data ??= {}).hProperties = { ...holder.data.hProperties, id: t.id };
          continue;
        }
        if (t.kind === "cite") {
          const id = t.source.slice("sources/".length);
          out.push({
            type: "link",
            url: resolveWikiTarget(ctx.course, t.source) + quoteFragment(t.quote),
            children: [{ type: "text", value: id }],
            data: { hProperties: { dataCite: "", dataQuote: t.quote } },
          });
          continue;
        }
        if (t.kind === "claim") {
          const label = `${t.topic} · ${t.id}`;
          if (ctx.claims === false) {
            out.push({ type: "text", value: label });
            continue;
          }
          out.push({
            type: "link",
            url: resolveWikiTarget(ctx.course, `knowledge/${t.topic}#^${t.id}`),
            children: [{ type: "text", value: label }],
            data: { hProperties: { dataClaim: `${t.topic}^${t.id}` } },
          });
          continue;
        }
        const label = t.alias ?? t.target.split("#")[0].split("/").pop() ?? t.target;
        out.push({
          type: "link",
          url: resolveWikiTarget(ctx.course, t.target),
          children: [{ type: "text", value: label || t.target }],
        });
      }
      if (last < node.value.length) out.push({ type: "text", value: node.value.slice(last) });
      // Only before a block id: elsewhere the space separates this text from the next inline node.
      if (block && out.length && out[out.length - 1].type === "text") {
        const tail = out[out.length - 1] as Text;
        tail.value = tail.value.replace(/\s+$/, "");
      }
      parent.children.splice(index, 1, ...(out as typeof parent.children));
      return [SKIP, index + out.length];
    });

    // A block id on a list item's only paragraph belongs to the item, so the anchor spans it.
    visit(tree, "listItem", (item) => {
      const p = item.children[0];
      const id = p?.type === "paragraph" ? (p.data?.hProperties?.id) : undefined;
      if (!id || item.children.length !== 1) return;
      delete p.data!.hProperties!.id;
      (item.data ??= {}).hProperties = { ...item.data.hProperties, id };
    });
  };
}

function mermaidBlocks(topics?: MarkdownContext["topics"]) {
  return (tree: Root) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid" || !parent || index === undefined) return;
      // An unknown node type with hName becomes that element in mdast-util-to-hast.
      parent.children[index] = {
        type: "mermaidDiagram",
        data: { hName: "mermaid-diagram", hProperties: { chart: withStatuses(node.value, topics) }, hChildren: [] },
      } as unknown as (typeof parent.children)[number];
    });
  };
}

function codeBlocks() {
  return (tree: Root) => {
    visit(tree, "code", (node, index, parent) => {
      if (!parent || index === undefined) return;
      parent.children[index] = codeBlockNode(node) as unknown as (typeof parent.children)[number];
    });
  };
}

/** Tags topic nodes in a flowchart with status classes (styled by the Mermaid component). */
function withStatuses(chart: string, topics: MarkdownContext["topics"]): string {
  if (!topics || !/^\s*(graph|flowchart)\b/.test(chart)) return chart;
  const ids = new Set(chart.match(/[A-Za-z0-9_-]+/g));
  const lines: string[] = [];
  const byStatus: Record<string, string[]> = {};
  for (const [slug, t] of Object.entries(topics)) {
    if (!ids.has(slug)) continue;
    if (t.status !== "todo") (byStatus[t.status] ??= []).push(slug);
    if (t.href) lines.push(`  click ${slug} href "${t.href}"`);
  }
  for (const [status, slugs] of Object.entries(byStatus)) {
    lines.push(`  class ${slugs.join(",")} course-${status}`);
  }
  return lines.length ? `${chart.replace(/\s+$/, "")}\n${lines.join("\n")}\n` : chart;
}

const components = { a: MarkdownLink, "mermaid-diagram": Mermaid, "code-block": CodeBlock } as unknown as Components;

export function renderMarkdown(md: string, ctx?: MarkdownContext): ReactNode {
  const tokens: Token[] = [];
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  if (ctx) processor.use(() => restoreObsidian(tokens, ctx));
  processor
    .use(() => mermaidBlocks(ctx?.topics))
    .use(codeBlocks)
    .use(remarkRehype)
    .use(rehypeKatex, { strict: "ignore" });
  // Plugins added conditionally leave the processor's types at remark's; the tree it returns is rehype's.
  const hast = processor.runSync(processor.parse(ctx ? liftObsidian(md, tokens) : md)) as unknown as HastRoot;
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, components });
}
