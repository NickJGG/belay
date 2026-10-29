---
name: checkpoint
description: Run a unit checkpoint on a course — an unseen task set from the unit's rubric, done without help, then marked per criterion. Records pass, partial or fail in the syllabus.
argument-hint: "<course> [--unit <n>]"
---

# /learn:checkpoint

An end-of-unit test of what the learner can do alone. You set the task, stay out of the way, then mark it strictly against the rubric.

- Plugin root `P`: `${CLAUDE_PLUGIN_ROOT}` (if that appears unexpanded, it is `C:\Users\Nick\Projects\Tools\belay\extensions\learn\plugin`).
- Read `P/references/formats.md` first: `syllabus.md` checkpoint lines, `rubrics/`, `misconceptions.md`, `log.md`, `lessons/`, `work/`.
- Load each trait in `course.md` from `P/references/traits/<trait>.md`; they apply to marking (a `notation` course re-checks every calculation).

## Route

- **No course:** run `node P/scripts/courses.js`, list the courses whose `checkpoint.due` is true, and ask.
- **Not ready:** no `course.md`, or the unit isn't in the overview's `ready` → hand off to `/learn:build <course>`.
- **Unit:** `--unit <n>` if given (a rerun, or a unit taken early); otherwise `checkpoint.unit` from `courses.js <course>`. `checkpoint` is null → every unit has passed; say so and offer `--unit <n>` to retake one.
- **Not due** (`left` isn't empty): say which topics are left. Checkpoints aren't gates, so ask whether to take it anyway.
- **No `rubrics/unit-<n>.md`:** the build held it back. Hand off to `/learn:build <course>`.

**Belay:** if `echo "${BELAY_CHANNEL:-}"` prints `1`, attach as soon as the course is known, as `/learn:learn` does: `mcp__plugin_belay_belay__attach` with `course`, `topic` `Checkpoint <n>` and `sessionId: "${CLAUDE_SESSION_ID}"`, then after the last line post the "Keep talking" / "End lesson" choice and detach only on "End lesson", as `/learn:learn` does.

## 1. Set the task

1. Read `rubrics/unit-<n>.md` and the unit's `knowledge/` files.
2. Build the task from the rubric's template for each of the course's traits:
   - `notation`: the unseen problems.
   - `code`: the spec, built from scratch in `work/checkpoint-NN/`.
   - `reading`: the 300–600-word essay.
   - `language`: the translation or writing task, plus a voice role-play. Write the role-play as `work/voice-NN.md` (shape in `P/references/traits/language.md`), with the rubric's brief as the scenario.

   Several traits: set all their parts as one checkpoint.
3. `NN` is the next two-digit number after the highest existing `work/checkpoint-NN.md` (first is `01`). Write `work/checkpoint-NN.md`:
   ```markdown
   # Checkpoint NN · unit <n> · <title>
   set: YYYY-MM-DD

   ## Rules
   Closed book: no notes, no course files, no AI. <code: the language's official docs are allowed.>
   Write your answers under Answers (or in work/checkpoint-NN/ for code). Type `done` in the terminal when finished.

   ## Task
   <numbered parts, with points per part from the rubric>

   ## Answers
   ```
   Don't copy the rubric's criteria or any solution into the file.
4. Tell the learner where the task is, the rules in one line, and to type `done` when finished. Then stop.

## 2. Stay silent

Until the learner types `done`:
- A question about what the task *means* (an ambiguous wording, a missing value) gets a one-line clarification of the task only. Note it for the marking.
- Anything else, including requests for hints or checking, gets only: "Checkpoint in progress. Type `done` when finished, or `abandon` to stop."
- `abandon`: write no result; append a `checkpoint` log entry (heading with the start time) with `- skipped: abandoned unit <n>` and `- ended: early`, and stop.

Language trait: the learner does the voice role-play from `work/voice-NN.md` and pastes the transcript. Save it verbatim as `work/voice-NN-transcript.md` before marking.

## 3. Mark

1. Read the answers: `work/checkpoint-NN.md`, anything in `work/checkpoint-NN/`, and the transcript. Never edit them.
2. For each rubric criterion: points awarded out of available, the level (full / partial / none), and the specific gap, citing the claim it misses as `[k:<topic>^c<n>]`. Re-derive every answer yourself before judging it; don't trust a first pass. Run code they wrote only if they ask, and judge it by what it does, not by how close it looks to your own version.
3. Score is total points awarded as a percentage, rounded down. Result:
   - **pass:** at or above the rubric's pass line (about 80%).
   - **partial:** at least 50%, below the pass line.
   - **fail:** below 50%.
4. Show the marking as a table (`criterion · points · gap`), then the score and result. Weak topics are those whose criteria lost more than half their points. If the learner disputes a mark, follow the tutor style's pushback rule: re-derive and quote the rubric and source, and change the mark only if they're right.

## 4. Record

1. **Syllabus:** set the unit's line to `- checkpoint <n> · <result> YYYY-MM-DD <score>%`, replacing any earlier result.
2. **By result:**
   - **pass:** the unit is mastered. Name the next unit's first topic.
   - **partial:** the unit stays open, and the checkpoint stays due for a retake. For each weak topic, append its main gap to *Mine* in `misconceptions.md` so session reviews revisit it, and propose 1–2 cards on it.
   - **fail:** do everything partial does, and also set the 1–3 weakest topics back to `- [ ] <topic> · in-progress`. The next `/learn:learn` session then picks them up first.

   Cards follow the `/learn:learn` close rule: show them, edit until approved, write `### <topic>` blocks to a scratch file, then `node P/scripts/cards.js add <course> <file>`.
3. **Lesson note:** `lessons/YYYY-MM-DD-checkpoint-<n>.md` holding the task file's path, the marking table, the score and result, any clarifications given, and the weak topics as `[[<topic>#^c<n>]]` links.
4. **log.md:** `HH:MM` is the local time the checkpoint started (`date +%H:%M`, noted when the task was set).
   ```
   ## YYYY-MM-DD · checkpoint · HH:MM
   - topics: <unit's topic slugs>
   - cards added: <n, if any>
   - checkpoint: unit <n> · <result> <score>%
   - misconceptions: <new, if any>
   - next: <topic or action>
   - ended: complete
   ```

End with one line: the result and what comes next (the next unit, `/learn:learn <course>` on a weak topic, or a retake via `/learn:checkpoint <course>`).
