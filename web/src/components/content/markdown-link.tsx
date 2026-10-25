import Link from "next/link";
import { ClaimChip } from "./claim-chip";
import styles from "./prose.module.css";

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  "data-cite"?: string;
  "data-quote"?: string;
  "data-claim"?: string;
};

/** Every link in rendered course Markdown: source and claim chips, in-site links, and external links. */
export function MarkdownLink({ href = "", children, ...rest }: Props) {
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
  if (href.startsWith("/")) return <Link href={href}>{children}</Link>;
  if (href.startsWith("#")) return <a href={href}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
