import type { ComponentType, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { visit } from "unist-util-visit";
import type { Root as HastRoot } from "hast";
import type { Root } from "mdast";
import { MarkdownLink, type MarkdownLinkProps } from "@/components/content/markdown-link";
import { Mermaid } from "@/components/content/mermaid";
import { CodeBlock } from "@/components/content/code-block";
import { codeBlockNode } from "./code-fence";
import { MARKDOWN_HANDLERS, type MarkdownContext } from "./extensions.markdown";

/*
 * Markdown → React: GFM, KaTeX math, and ```mermaid blocks and highlighted code blocks drawn client-side. Raw HTML is dropped, as remark-rehype
 * does by default. Runs on both sides: course and legacy pages on the server, the drawer in the browser.
 *
 * A context names an extension's handler, which adds its own syntax (`extensions.markdown.ts`).
 */

export type { MarkdownContext };

/** An extension's Markdown syntax, for pages and sessions that pass its context. */
export type MarkdownHandler<C> = {
  /** Lifts its syntax out of the raw text so the parser leaves it whole; `restore` is the pass that puts it back. */
  lift(md: string, ctx: C): { md: string; restore: (tree: Root) => void };
  /** Rewrites a Mermaid chart before it's drawn. */
  chart?(chart: string, ctx: C): string;
  /** Draws every link, its own and (through `MarkdownLink`) the rest. */
  link?: ComponentType<MarkdownLinkProps>;
};

function mermaidBlocks(chart: (chart: string) => string) {
  return (tree: Root) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid" || !parent || index === undefined) return;
      // An unknown node type with hName becomes that element in mdast-util-to-hast.
      parent.children[index] = {
        type: "mermaidDiagram",
        data: { hName: "mermaid-diagram", hProperties: { chart: chart(node.value) }, hChildren: [] },
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

const components = { a: MarkdownLink, "mermaid-diagram": Mermaid, "code-block": CodeBlock } as unknown as Components;

export function renderMarkdown(md: string, ctx?: MarkdownContext): ReactNode {
  const handler = ctx && (MARKDOWN_HANDLERS[ctx.id] as MarkdownHandler<MarkdownContext>);
  const lifted = handler?.lift(md, ctx!);
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  if (lifted) processor.use(() => lifted.restore);
  processor
    .use(() => mermaidBlocks((chart) => handler?.chart?.(chart, ctx!) ?? chart))
    .use(codeBlocks)
    .use(remarkRehype)
    .use(rehypeKatex, { strict: "ignore" });
  // Plugins added conditionally leave the processor's types at remark's; the tree it returns is rehype's.
  const hast = processor.runSync(processor.parse(lifted?.md ?? md)) as unknown as HastRoot;
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, components: handler?.link ? { ...components, a: handler.link } : components });
}
