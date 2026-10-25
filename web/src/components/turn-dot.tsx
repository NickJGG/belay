import { cn } from "@/lib/utils";
import styles from "./turn-dot.module.css";

/** A live session's dot: a quiet grey pulse while Claude works, a still ember dot with a halo on your turn. */
export function TurnDot({ working }: { working: boolean }) {
  return <span className={cn(styles.dot, working ? styles.working : styles.yours)} aria-hidden />;
}
