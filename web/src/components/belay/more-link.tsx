import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import styles from "./belay.module.css";

/** A list's foot: a centred small outline button that loads more of it, keeping the scroll position. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className={styles.more}>
      <Link className={buttonClass("outline", "sm")} href={href} scroll={false}>
        {children}
      </Link>
    </div>
  );
}
