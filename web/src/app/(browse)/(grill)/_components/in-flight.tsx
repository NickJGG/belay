import { GrillRow } from "@/components/belay/grill-row";
import styles from "@/components/belay/belay.module.css";
import type { FlightGroup, ListsContext } from "@/lib/slots";
import { flight } from "../_lib/projects.server";
import type { GrillSession } from "../_lib/sessions";

/** In flight's Grills: live grills, then grills no issue links to yet. */
export function grillFlight(c: ListsContext<GrillSession>): FlightGroup | null {
  const grills = flight(c);
  if (!grills.length) return null;
  return {
    id: "flight-grills",
    label: "Grills",
    count: grills.length,
    rows: (
      <ul className={styles.rows}>
        {grills.map((g) => (
          <GrillRow key={g.slug} {...g} />
        ))}
      </ul>
    ),
  };
}
