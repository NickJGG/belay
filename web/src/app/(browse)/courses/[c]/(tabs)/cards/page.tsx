import { notFound } from "next/navigation";
import { Group } from "@/components/belay/group";
import belay from "@/components/belay/belay.module.css";
import { Prose } from "@/components/content/prose";
import styles from "@/components/course/course.module.css";
import { courseData } from "@/lib/course-data";
import { listCards, today, type CardRow } from "@/lib/courses";
import { relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";

function Rows({ course, cards, now }: { course: string; cards: CardRow[]; now: string }) {
  return (
    <ul className={belay.rows}>
      {cards.map((card) => {
        const line = (
          <>
            <Prose compact className={cn(belay.grow, styles.inline)} markdown={card.q} course={{ course }} />
            <span className={styles.faint}>{card.state}</span>
            <span className={styles.due}>{relativeDue(card.due, now)}</span>
          </>
        );
        return card.a === null ? (
          <li key={card.id} className={belay.row}>
            {line}
          </li>
        ) : (
          <li key={card.id} className={cn(belay.row, styles.card)}>
            <details>
              <summary title="Show the answer">{line}</summary>
              <Prose compact className={styles.answer} markdown={card.a} course={{ course }} />
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Cards (grill Q28): Due today open, Later collapsed. Rows are the question, its state and when it's due; a card
 * that has been reviewed opens in place to its answer (unreviewed answers stay hidden).
 */
export default async function CardsTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  if (!(await courseData(c))) notFound();
  const cards = listCards(c);
  if (!cards.length) return <p className={belay.empty}>No cards yet. Sessions add them as you learn.</p>;
  const now = today();
  const due = cards.filter((card) => card.due <= now);
  const later = cards.filter((card) => card.due > now).sort((a, b) => a.due.localeCompare(b.due));
  return (
    <div className={cn(styles.body, styles.notes)}>
      <Group id={`${c}:cards:today`} label="Due today" count={due.length} headClassName={styles.unitHead}>
        {due.length ? <Rows course={c} cards={due} now={now} /> : <p className={styles.empty}>Nothing due.</p>}
      </Group>
      <Group id={`${c}:cards:later`} label="Later" count={later.length} defaultOpen={false} headClassName={styles.unitHead}>
        {later.length ? <Rows course={c} cards={later} now={now} /> : <p className={styles.empty}>Nothing later.</p>}
      </Group>
    </div>
  );
}
