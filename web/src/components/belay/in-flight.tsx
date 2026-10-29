import type { FlightIssue } from "@/lib/data";
import type { FlightGroup } from "@/lib/slots";
import { Group } from "./group";
import { IssueRows, keyColumn } from "./issue-rows";
import styles from "./belay.module.css";

/** Home's In flight: an Issues group then the active extensions' groups, each in its page's row shape; an empty one is left out. */
export function InFlight({ issues, groups }: { issues: FlightIssue[]; groups: FlightGroup[] }) {
  if (!issues.length && !groups.length) return <p className={styles.empty}>Nothing in flight.</p>;
  return (
    <>
      {issues.length ? (
        <Group id="flight-issues" label="Issues" count={issues.length}>
          <div style={keyColumn(issues.map((t) => t.id))}>
            <IssueRows issues={issues} />
          </div>
        </Group>
      ) : null}
      {groups.map((g) => (
        <Group key={g.id} id={g.id} label={g.label} count={g.count}>
          {g.rows}
        </Group>
      ))}
    </>
  );
}
