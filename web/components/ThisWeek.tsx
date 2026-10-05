import Link from 'next/link';
import type { GoalProgress } from '../../src/goals.ts';
import type { WeekRow } from '../../src/week.ts';
import { projectHref } from '@/components/bits';
import ui from '@/components/ui.module.css';
import { daysBetween, weekGoal } from '@/lib/data';
import styles from './ThisWeek.module.css';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Target = Extract<GoalProgress, { form: 'target' }>;

function Meter({ done, of, unit }: { done: number; of: number; unit: string }) {
  const reached = done >= of;
  return (
    <div
      className={styles.meter}
      data-reached={reached || undefined}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={of}
      aria-valuenow={done}
      aria-label={`${done} of ${of} ${unit}`}
      title={`${done} of ${of} ${unit}`}
    >
      <div className={styles.fill} style={{ width: `${Math.min(100, (done / Math.max(of, 1)) * 100)}%` }} />
    </div>
  );
}

const W = 120;
const H = 22;
/** Room for the today marker: radius plus its ring. */
const PAD = 5;

/** Issues left per day against the even pace from the scope at `set` down to zero on the target date. */
function Burndown({ goal, set, points }: { goal: Target; set: string; points: { day: string; left: number }[] }) {
  const span = Math.max(1, daysBetween(set, goal.date));
  const top = Math.max(1, goal.scope, ...points.map((p) => p.left));
  const x = (i: number) => PAD + (i / span) * (W - 2 * PAD);
  const y = (left: number) => PAD + (1 - left / top) * (H - 2 * PAD);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.left).toFixed(1)}`).join(' ');
  const last = points.at(-1);
  const step = (W - 2 * PAD) / span;
  return (
    <svg className={styles.burndown} data-state={goal.state} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${goal.left} of ${goal.scope} left, due ${goal.date}, set ${set}`}>
      <line className={styles.pace} x1={x(0)} y1={y(goal.scope)} x2={x(span)} y2={y(0)} />
      {points.length > 1 && <polyline className={styles.actual} points={line} />}
      {last && <circle className={styles.now} cx={x(points.length - 1)} cy={y(last.left)} r={4} />}
      {points.map((p, i) => (
        <rect key={p.day} className={styles.hit} x={x(i) - step / 2} y={0} width={Math.max(step, 6)} height={H}>
          <title>{`${p.day}: ${p.left} left`}</title>
        </rect>
      ))}
    </svg>
  );
}

function Days({ week, moved }: { week: string[]; moved: (boolean | null)[] }) {
  return (
    <span className={styles.days}>
      {moved.map((m, i) => (
        <span key={week[i]} className={styles.day} data-moved={m ?? 'later'} title={`${DAY_NAMES[i]} ${week[i]}: ${m === null ? 'ahead' : m ? 'moved' : 'no moves'}`} />
      ))}
    </span>
  );
}

/** One row per goal that counts: a meter for habits and quantities, a burndown for targets, and the week's moved days. */
export function ThisWeek({ rows, week, burndowns }: { rows: WeekRow[]; week: string[]; burndowns: Record<string, { set: string; points: { day: string; left: number }[] }> }) {
  return (
    <ul className={ui.rows}>
      {rows.map((r) => {
        const g = r.goal!;
        return (
          <li key={r.project} className={`${ui.row} ${styles.row}`}>
            <Link href={projectHref(r.project)} className={`${ui.mono} ${styles.key}`}>
              {r.project}
            </Link>
            <span className={styles.viz}>
              {g.form === 'target' ? (
                g.state !== 'noscope' && <Burndown goal={g} {...burndowns[r.project]} />
              ) : (
                <Meter done={g.done} of={g.of} unit={g.form === 'habit' ? 'days' : g.kind} />
              )}
            </span>
            <span className={`${ui.grow} ${g.form === 'target' && g.state === 'overdue' ? ui.warn : ''}`}>
              {weekGoal(g)}
              {g.form !== 'target' && g.metToday && <span className={ui.muted}> · today ✓</span>}
            </span>
            <Days week={week} moved={r.moved} />
          </li>
        );
      })}
    </ul>
  );
}
