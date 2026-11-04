import styles from "@/components/belay/belay.module.css";
import type { FlightGroup, ListsContext } from "@/lib/slots";
import { flight } from "../_lib/projects.server";
import type { ReviewSession } from "../_lib/sessions";
import { ReviewRow } from "./review-row";

/** In flight's Reviews: live reviews, then those running or needing you. */
export function reviewFlight(c: ListsContext<ReviewSession>): FlightGroup | null {
  const rows = flight(c);
  if (!rows.length) return null;
  return {
    id: "flight-reviews",
    label: "Reviews",
    count: rows.length,
    rows: (
      <ul className={styles.rows}>
        {rows.map((r) => (
          <ReviewRow key={r.id} row={r} live={r.live} working={r.working} mark={r.mark} />
        ))}
      </ul>
    ),
  };
}
