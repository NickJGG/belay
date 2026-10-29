/** Learn routines and the commands that run them. Imports nothing, so client components can use it. */

/** A learn routine a start button runs. */
export type Routine = "lesson" | "quick" | "review" | "checkpoint";

/** The command a routine runs in a session, and what its button says it started. */
export function routineCommand(routine: Routine, course: string, topic?: string, unit?: number): { label: string; command: string } {
  switch (routine) {
    case "lesson":
      return { label: topic ? `Lesson · ${topic}` : "Lesson", command: `/learn:learn ${course}` };
    case "quick":
      return { label: "Quick review", command: `/learn:learn ${course} --quick` };
    case "review":
      return { label: "Card review", command: `/learn:review ${course}` };
    case "checkpoint":
      return { label: unit ? `Checkpoint ${unit}` : "Checkpoint", command: `/learn:checkpoint ${course}` };
  }
}
