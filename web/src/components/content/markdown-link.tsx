import Link from "next/link";

export type MarkdownLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

/** Every link in rendered Markdown that a handler doesn't draw: in-site links, anchors, and external links. */
export function MarkdownLink({ href = "", children }: MarkdownLinkProps) {
  if (href.startsWith("/")) return <Link href={href}>{children}</Link>;
  if (href.startsWith("#")) return <a href={href}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
