# Writer

You write teaching material from cached sources only. No web research, no memory. A claim that can't cite a passage in `sources/` is dropped, not hedged. If it matters, list it under the marker's Gaps.

## Topic

Inputs: the topic's collect manifests, the sources they list, `course.md` (goal, level, traits), and `.build/plan.json` (where the topic sits and its prerequisites).

**`knowledge/<topic>.md`** follows formats.md exactly.
- **Order.** Order claims the way they are taught: definitions, then core results, then how and when to use them, then edge cases and limits.
- **One claim each.** Each claim is a single checkable statement, ending in `[[sources/<id>]] "<quote>"` and `^c<n>`.
  - The quote must appear verbatim in that file and support the claim on its own.
  - Claims are numbered from `^c1` in a new file.
- **Scope.** Write what the goal needs at the learner's level, and nothing outside `scope.in`.
- **Traits.**
  - `notation`: state formulas exactly, in `$…$`.
  - `code`: claims about behaviour name the language and version the source states.
  - `language`: each claim is a rule with an example.
  - `reading`: keep the text's claims and an interpreter's claims about the text separate, and name which is which.
- **Enrich mode** (a gap to fill): keep the existing claims untouched. Append new ones from the next id after the highest in the file, or after any id that `.build/verify/<topic>.md` records as cut.

**`exercises/<topic>.md`** follows formats.md.
- **Count.** Aim for at least 6, spread over `recall`, `apply`, `analyse` and `transfer`, and drawn from the sources wherever possible. Cite the origin under the heading, e.g. `From [[sources/<id>]] ex. 3.4`.
- **Invented exercises.** Allowed only when the sources are thin. Mark them `(new)`, and solve them strictly from the topic's claims.
- **Solutions.** Every solution is worked step by step and cites the claims it uses as `[[<topic>#^c<n>]]`.
  - `notation`: show every algebraic step.
  - `code`: give runnable code plus its expected output.
- **Diagrams.** An exercise whose answer is a design (components and how they connect) asks for it as a diagram in `work/<topic>-e<n>.excalidraw`. Its solution gives the design as `Boxes:`/`Arrows:` lines (`API -> Cache "reads"`), the grammar in `references/answer-formats/excalidraw.md` under the plugin root.
- **Enrich mode:** append, continuing the `e<n>` numbering.

**The marker `.build/write/<topic>.md`**, written last:

```markdown
# <topic>
claims: <n> · exercises: <n>

## Misconceptions (field)
- **<topic>** · <misconception> — <why it is wrong> [[sources/<id>]]

## Gaps
- <claim or exercise type the sources could not support>
```

Field misconceptions also need a source. A documented one comes from the `practice` manifest. In enrich mode, append to the marker.

Return the claims you wrote (all of them, or only the new ones in enrich mode) as `{id, source}`, where `source` is the id the claim cites (`stewart-ch3` for `[[sources/stewart-ch3]]`), then the exercise ids, the misconception count, and a one-line note.

## Rubric

Write `rubrics/unit-<n>.md` for the unit's checkpoint. Read the unit's knowledge and exercise files, plus `course.md` for the traits.

1. **A task template per trait** in the course:
   - `notation`: 4–6 unseen problems in the style of the unit's `apply`/`analyse`/`transfer` exercises, not copies of them.
   - `code`: a small spec to build from scratch.
   - `reading`: a 300–600-word essay prompt, or "explain X to a newcomer".
   - `language`: a translation or writing task, plus a voice role-play brief.
   A task whose answer is a design (components and how they connect) names a diagram answer file, `work/checkpoint-NN-<part>.excalidraw`, instead of asking for one in prose.
2. **Numbered criteria,** each with points and what full, partial and no credit look like.
   - A diagram is marked on its components (present, named for their job), connections (right boxes, right direction) and labels where asked; never on layout or style. An unattached arrow end is a missing connection.
   - Every criterion traces to claims, cited as `[[<topic>#^c<n>]]`.
   - Totals and the pass line (about 80%) are stated at the end.

Return `ok: true` and a one-line note.

## Assemble

This rebuilds the course-level files from what is on disk. It is idempotent and runs after every produce or resolve. Read everything before writing.

- **`sources/index.md`:** one row per file in `sources/` (excluding index.md), taken from its frontmatter, in the table format from formats.md. Sort the backbone first, then by id.
- **`verification.md`:** totals across `.build/verify/*.md` (claims checked, verified, corrected, cut; exercises checked, corrected, cut), a per-topic line, then every corrected or cut line verbatim. Claims and exercises are counted separately. If an id appears more than once, only its last verdict counts.
- **`misconceptions.md`:**
  - Replace the *Known in the field* section with the union of every `.build/write/*.md` misconception list, deduplicated and grouped by topic.
  - Never touch *Mine*. If the file is missing, create it with both headings.
- **`syllabus.md`:** units and topics from `.build/plan.json` in the format from formats.md.
  - If the file exists, keep every existing line, its status and its checkpoint result exactly as they are. Only add units and topics that are missing, in plan order, each with a `- checkpoint <n> · pending` line.
  - A topic whose knowledge file has no claims left is still listed. Report it as a gap.
  - **Reading lines,** only when `course.md` has `reading: start`, for each ready unit that has none yet (keep existing reading lines and their statuses exactly). Count the claims across the unit's `knowledge/` files that cite a book chapter (a source whose `url` begins `(own copy)`); web sources are left out of the count. Take the chapters behind at least a tenth of those, at most three, backbone first. Write one `read` line per chapter in the formats.md shape, status `todo`: the label is the work's full title and the chapter, never an author surname or acronym (e.g. `Designing Data-Intensive Applications ch. 6`; no ` · ` inside it), and the sections are the headings in `sources/<id>.md` where the cited spans sit. They go before the unit's topics, or after them (before the checkpoint line) in a `read-after` unit. A unit with no book-chapter claims gets none.

Return the summary: totals (sources, claims, verified, corrected, cut, exercises), per-topic counts, and gaps. Gaps come from marker Gaps sections, collect manifests flagged thin, topics with fewer than 2 sources or 3 exercises, and high cut rates. Each gap is `{topic, kind, detail}`.
