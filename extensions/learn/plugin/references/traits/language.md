# Trait: language

For learning a human language.

- **Keep `corrections.md`.** Each recurring error is one line in the formats.md shape. When an error recurs, bump its `×<n>` and add the date to `seen`; don't add a duplicate line. Create the file on the first correction.
- **Correct by recast, then make them redo it.** Repeat their sentence correctly, point at what changed, and have them produce a new sentence with the same pattern. Don't explain grammar unless they ask or the same error recurs.
- **Production over recognition.** Practice and quiz items ask them to say or write something (translate into the target language, answer a question in it, transform a sentence), not to pick or translate out of it.
- **Revisit from `corrections.md`** in step 2 as well as from *Mine*: pick the patterns with the highest `×<n>` and build a sentence that needs them.
- **Target-language ratio:** as the course moves on, run more of the session in the target language, at the learner's level. Switch to English only for explanation they ask for.
- **Cards:** one per pattern, with the example in context; the A gives the correct form and a short note.
- **Voice practice** happens outside sessions (ChatGPT or Gemini voice), from `work/voice-NN.md` prompts; the learner pastes the transcript back for marking. See below.

## Voice round trip

**Writing the prompt.** At the close of a full session, offer one. `NN` is the next two-digit number after the highest existing `work/voice-NN.md`. The file is a prompt the learner pastes into the voice app as-is:

```markdown
# Voice NN · YYYY-MM-DD
targets: <the 2–4 corrections.md patterns used, by name>

Paste everything below the line into ChatGPT or Gemini voice mode.

---
You are <role> in <scenario>. Speak only <target language>, at <level> (<what that means: tenses, vocabulary range, speed>).
Hold a 5–10 minute conversation. Steer it so I must use: <for each target pattern, the situation that forces it, without naming the grammar>.
Don't correct me during the conversation; if you can't understand me, ask me to say it again in other words.
Keep your turns short so that I do most of the talking.
```

Choose the targets from `corrections.md`, highest `×<n>` first, plus today's topic. Make the scenario fit the course goal.

**Marking the transcript** (`/learn:learn <course> --voice`, or when one is pasted in a session):
1. Save the paste verbatim as `work/voice-NN-transcript.md`, matching the newest prompt without a transcript, unless the learner names one.
2. Mark only the learner's turns. Group errors by pattern. For each: the line as said, the recast, and the claim or pattern it breaks. Note which targets were used correctly and which were avoided; avoiding a target counts as unpractised, not as passed.
3. Update `corrections.md` (bump `×<n>` and `seen`, or add a line). Have the learner redo the two most frequent errors as new sentences.
4. Propose cards for new patterns, and log `## YYYY-MM-DD · voice` with `topics`, `misconceptions` (patterns bumped or added) and `next`.
