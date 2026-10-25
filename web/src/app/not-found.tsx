"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { missing } from "@/lib/shell";
import styles from "./not-found.module.css";

/** A 404 inside the shell (grill Q36). Not found pages get no params, so the address says what's missing. */
export default function NotFound() {
  const { what, back } = missing(usePathname() ?? "/");
  return (
    <div className={styles.wrap}>
      <PageHeader title="Not found" />
      <p className={styles.line}>
        {what}{" "}
        <Link href={back.href} className={styles.back}>
          {back.label}
        </Link>
      </p>
    </div>
  );
}
