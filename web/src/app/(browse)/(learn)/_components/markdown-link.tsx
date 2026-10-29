import Link from "next/link";
import { ClaimChip } from "@/components/content/claim-chip";
import { MarkdownLink, type MarkdownLinkProps } from "@/components/content/markdown-link";
import styles from "@/components/content/prose.module.css";

type Props = MarkdownLinkProps & {
  "data-cite"?: string;
  "data-quote"?: string;
  "data-claim"?: string;
};

/** Every link in rendered course Markdown: source and claim chips, then the core's links. */
export function CourseLink({ href = "", children, ...rest }: Props) {
  const claim = rest["data-claim"];
  if (claim) {
    return (
      <ClaimChip href={href} claim={claim}>
        {children}
      </ClaimChip>
    );
  }
  const quote = rest["data-quote"];
  if (rest["data-cite"] !== undefined) {
    return (
      <Link href={href} className={styles.cite} data-quote={quote || undefined}>
        {children}
      </Link>
    );
  }
  return <MarkdownLink href={href}>{children}</MarkdownLink>;
}
