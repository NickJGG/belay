import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { Mermaid } from "@/components/content/mermaid";

/*
 * Chat and legacy-session Markdown → React: GFM, KaTeX math, and ```mermaid blocks drawn client-side.
 * Topo's pipeline without its Obsidian syntax. Raw HTML is dropped, as remark-rehype does by default.
 * Runs on both sides: the legacy page on the server, the drawer in the browser.
 */

function mermaidBlocks() {
  return (tree: Root) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid" || !parent || index === undefined) return;
      // An unknown node type with hName becomes that element in mdast-util-to-hast.
      parent.children[index] = {
        type: "mermaidDiagram",
        data: { hName: "mermaid-diagram", hProperties: { chart: node.value }, hChildren: [] },
      } as unknown as (typeof parent.children)[number];
    });
  };
}

function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = /^https?:/.test(props.href ?? "");
  return jsx("a", { ...props, ...(external ? { target: "_blank", rel: "noreferrer" } : {}) });
}

const components = { a: Link, "mermaid-diagram": Mermaid } as unknown as Components;

export function renderMarkdown(md: string): ReactNode {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(mermaidBlocks)
    .use(remarkRehype)
    .use(rehypeKatex, { strict: "ignore" });
  const hast = processor.runSync(processor.parse(md));
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, components });
}
