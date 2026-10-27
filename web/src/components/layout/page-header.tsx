import * as React from "react";
import { Toolbar } from "@/components/ui/toolbar";
import styles from "./page-header.module.css";

/** The header every page shares: the Toolbar, with a count beside the title. */
export function PageHeader({
  title,
  count,
  back,
  nav,
  children,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  back?: { href: string; label: string };
  nav?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <Toolbar
        title={
          <>
            {title}
            {count != null ? <span className={styles.count}>{count}</span> : null}
          </>
        }
        back={back}
        nav={nav}
      >
        {children}
      </Toolbar>
    </div>
  );
}
