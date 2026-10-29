---
name: status
description: Show a table of every course — cards due, next topic, last session, next checkpoint.
---

# /learn:status

Read-only. Plugin root `P`: `${CLAUDE_PLUGIN_ROOT}` (if that appears unexpanded, it is `C:\Users\Nick\Projects\Tools\belay\extensions\learn\plugin`).

1. Run `node P/scripts/courses.js`. It reads `course.md`, `syllabus.md`, `log.md` and `cards.js stats` for every course under the learning root. Empty: say there are no courses and offer `/learn:build <subject>`.
2. Print one table, courses with cards due first, then by last session (most recent first):

   | course | cards due | next topic | progress | last session | next checkpoint |
   |---|---|---|---|---|---|

   - **cards due:** `cards.due` (add `· <overdue> overdue` if any). None due: `0 · next <nextDue>`.
   - **next topic:** `next.topic` (`· in progress` if so). None left: `—`.
   - **progress:** `topics.done/topics.total`.
   - **last session:** `last.date · last.kind`, plus how many days ago. Never: `—`.
   - **next checkpoint:** `unit <n> · <left count> topics left`; `unit <n> · due` when `due` is true; add `(last: partial|fail)` if the result isn't `pending`. All passed: `all passed`.
   - A course with no ready unit: put `building (<build>)` in the next-topic cell and `—` elsewhere except cards.
   - Units still to build (`unbuilt`): add `· units <list> building (<build>)` to the next-topic cell, or `· units <list> unbuilt` when `build` is `accepted`. Progress counts ready units only.
3. Below the table, at most three one-line suggestions: due checkpoints (`/learn:checkpoint <course>`), large review backlogs (`/learn:review <course>`), courses whose ready units are all done but have `unbuilt` units (`/learn:build <course> --units <n>`), and courses untouched for over a week.
