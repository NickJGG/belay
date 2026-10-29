---
name: review
description: Review due flashcards for a course, with FSRS grading. Cards only, no teaching.
argument-hint: "<course> [--all]"
---

# /learn:review

Cards only: no objective, no teaching, no quiz.

- Plugin root `P`: `${CLAUDE_PLUGIN_ROOT}` (if that appears unexpanded, it is `C:\Users\Nick\Projects\Tools\belay\extensions\learn\plugin`).
- Card format: the `cards.md` section of `P/references/formats.md`. Every change goes through `node P/scripts/cards.js`; never hand-edit `cards.md`.

**Belay:** if `echo "${BELAY_CHANNEL:-}"` prints `1`, attach as soon as the course is known, as `/learn:learn` does: `mcp__plugin_belay_belay__attach` with `course`, `topic` `Card review` and `sessionId: "${CLAUDE_SESSION_ID}"`, then after the last line post the "Keep talking" / "End lesson" choice and detach only on "End lesson", as `/learn:learn` does.

1. **No course given:** run `node P/scripts/courses.js` and list the courses with cards due. One course with cards due: use it. Otherwise ask.
2. `cards.js due <course>`. None due: say so, give `nextDue` from `cards.js stats <course>`, and stop.
3. Say how many are due. Do them oldest first; stop at 20 unless `--all` is given or the learner asks to keep going.
4. Each card, one at a time:
   - Show the Q and wait for an answer. A card with `math: true` goes into the course's `now.md` (Q, then the A appended after they answer); the terminal says "card <id> in now.md".
   - Compare their answer with the A and say plainly what was missing or wrong.
   - Propose a grade: `again` wrong or blank, `hard` right with struggle or gaps, `good` right, `easy` instant and complete. The learner can override.
   - `cards.js grade <course> <id> <grade>`.
   - If the learner says the card is vague, wrong or gives its answer away, propose new wording. Once they approve it, write the `### <id>` block with `Q:`/`A:` to a scratch file and run `cards.js edit <course> <file>`.
5. Finish with: reviewed, how many `again`, remaining due, and `nextDue`. If the same topic got two or more `again`, suggest `/learn:learn <course>` on it.
6. Append to `log.md`, with the local time the review started (`date +%H:%M`); `ended: early` if the learner stopped before the due cards (or the 20) were done:
   ```
   ## YYYY-MM-DD · review · HH:MM
   - cards: <n> reviewed (<again> again)
   - ended: complete | early
   ```
