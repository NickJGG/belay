import type { FlightGrill, FlightIssue } from "@/lib/data";
import { Group } from "./group";
import { GrillRow } from "./grill-row";
import { IssueRows, keyColumn } from "./issue-rows";
import styles from "./belay.module.css";

/** Home's In flight: an Issues group then a Grills group, each in its page's row shape; an empty one is left out. */
export function InFlight({ issues, grills }: { issues: FlightIssue[]; grills: FlightGrill[] }) {
  if (!issues.length && !grills.length) return <p className={styles.empty}>Nothing in flight.</p>;
  return (
    <>
      {issues.length ? (
        <Group id="flight-issues" label="Issues" count={issues.length}>
          <div style={keyColumn(issues.map((t) => t.id))}>
            <IssueRows issues={issues} />
          </div>
        </Group>
      ) : null}
      {grills.length ? (
        <Group id="flight-grills" label="Grills" count={grills.length}>
          <ul className={styles.rows}>
            {grills.map((g) => (
              <GrillRow key={g.slug} {...g} />
            ))}
          </ul>
        </Group>
      ) : null}
    </>
  );
}
