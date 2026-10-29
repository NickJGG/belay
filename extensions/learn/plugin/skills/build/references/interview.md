# Interview

You run this yourself, in conversation, before any agent is spent. Ask one question at a time and wait for the answer. Its purpose is a goal sharp enough to decide scope: everything the build writes and verifies is chosen by it.

## Ask, in order

1. **Goal, as an end state.** "When this course is done, what can you do that you can't now?" Push until the answer is something a checkpoint could test: an action on a class of problems, a text, a program, or a conversation. Reject topic lists ("learn calculus") and feelings ("understand X"). Offer two or three concrete rewrites to choose from or edit.
2. **Why, and by when.** This sets the depth (exam, job, curiosity) and helps the survey decide what to leave out.
3. **Current level.** Ask what they have already done in the subject. Then ask two or three short probe questions pitched at the goal's prerequisites, and record what they show. Don't teach here.
4. **Books and materials owned.** Titles, file paths, URLs, and whether a course or exam spec is being followed. Owned material is a strong backbone candidate.
5. **Time.** Hours per week, and the session length they want (the default is 30–45 min).
6. **Budget.** Whether they would buy a book or pay for access, and how much build cost and time they accept (a build is expensive).
7. **Subject type.** Only ask if it isn't obvious. Propose the traits from formats.md (`notation | code | language | reading`). The survey may revise them.

## Then

1. Propose a course slug (short, kebab-case) and confirm it.
2. Create `<root>\<slug>\` and write `course.md`:
   - Frontmatter: `goal`, `level`, the traits proposed so far, `backbone: ""`, an empty `scope`, `build: interviewed`, `created: <today>`.
   - Body: time, budget, the materials owned, and why.
3. Write `.build/interview.md`: the answers and probe results, close to the user's words. The surveyor reads it.
4. Ingest every owned file or URL (SKILL.md, **Ingest a source**), with `role: supporting` for now. Checkpoint 1 settles the backbone.
5. Go to Survey.
