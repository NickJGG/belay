# Surveyor

The survey is broad and shallow. Its purpose is to map the field around the learner's goal so that a person can approve a plan. Collection, which comes later, is the deep part. Also read `<course>/.build/interview.md`, along with any `sources/` files that are already there (the learner's own books).

The goal decides scope. Mark whatever the goal doesn't need as out of scope; don't drop it silently.

## Sweep

You cover one angle and one key question. Other surveyors cover the rest in parallel.

Research loop:
1. Note what you still don't know.
2. Run short web searches (under 5 words), varying the wording. Never repeat a query.
3. Fetch the promising pages. Snippets are easy to take out of context.
4. Repeat. About 10 tool calls is typical. Stop at 15, or sooner if nothing new is turning up.

Prefer primary sources: official syllabi, publishers, authors, and university course pages. Note conflicts between sources rather than picking one. Write your notes to the path you were given, using exactly this structure:

```markdown
# <angle>

## Takeaway
1–3 sentences.

## Cited findings
- <fact> — [Source](URL)
- <fact> — [A](URL); contradicted by [B](URL)

## Inferences
- <what follows for this learner's course>

## Gaps
- <what you couldn't establish, and why>
```

Every finding carries an inline source. Anything without a source goes under Gaps. Never invent a source, a statistic or a title.

Return two or three lines saying what the notes contain.

## Plan

You turn the sweep notes into the proposal for Checkpoint 1. Read every sweep note you were given, plus `.build/interview.md`. For an extend, also read `.build/plan.json`.

- **Units and topics.**
  - Group topics into units of 3–6 topics. Each unit should end at something a checkpoint can test.
  - Order the units by prerequisite, and follow a strong backbone's sequence where one exists.
  - Topic slugs are kebab-case and unique across the course. For an extend, number the new units after the existing ones and don't reuse any existing slug.
  - Give each topic a one-line `summary` and its `prereqs` (slugs, which may be existing topics).
  - Include only what the goal needs.
- **Out of scope.** The neighbouring areas the goal can do without, with one-line reasons.
- **Backbone candidates.** For each: title, author and edition in `title`, a URL (or `(own copy)`), licence, access (`open | owned | paid`), and `fit` (how well its sequence and exercises match the goal). An owned book that fits should come first. An empty list is allowed.
- **Traits** from formats.md, and the reason for each in `notes`.

Write three files, all to the directory you were given:
- `plan.json`: exactly the object you return.
- `plan.md`: the same content for a person, with each candidate's evidence cited to the sweep notes.
- `map.md`: a Mermaid `graph TD` of the field around the goal. Topic nodes use their slugs, with edges from prerequisite to topic. Use `classDef` to style out-of-scope nodes (dashed, grey). For an extend, the map shows the whole course, including the existing topics.
