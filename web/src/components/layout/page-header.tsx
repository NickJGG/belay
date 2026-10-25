import * as React from "react";
import { CourseTerrain } from "@/components/course/course-terrain";
import { Toolbar } from "@/components/ui/toolbar";
import styles from "./page-header.module.css";

/**
 * The header every page shares (grill Q10/Q21): Topo's Toolbar with contour art fading down into the page, and
 * only the title row on the art. `hue` defaults to the brand's; `seed` picks the terrain.
 */
export function PageHeader({
  title,
  count,
  back,
  hue = "var(--brand)",
  seed = "belay",
  nav,
  children,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  back?: { href: string; label: string };
  hue?: string;
  seed?: string;
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
        backdrop={
          <div className={styles.art} style={{ "--hue": hue } as React.CSSProperties}>
            <CourseTerrain slug={seed} width={900} height={100} />
          </div>
        }
      >
        {children}
      </Toolbar>
    </div>
  );
}
