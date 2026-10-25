import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { lastMode, lower, stepLabel, Tail, Turns, type Record_ } from "../transcript.mts";

const ctx = { slug: "demo", sessionsDir: "C:\\Users\\Nick\\Sear\\sessions" };
const S = "C:\\Users\\Nick\\Sear\\sessions\\demo";

// Trimmed from real Claude Code 2.1.309 transcripts.
const at = (s: number) => `2026-10-23T23:21:${String(s).padStart(2, "0")}.000Z`;
const prompt = (s: number, content: string): Record_ => ({
  isSidechain: false,
  type: "user",
  message: { content },
  timestamp: at(s),
});
const channel = (s: number): Record_ => ({
  isSidechain: false,
  type: "user",
  message: {
    content:
      '<channel source="plugin:sear:sear" slug="demo" kind="answer" q="6" opt="a">\nSear site, session `demo`: picked option a for Q6.\n</channel>',
  },
  isMeta: true,
  timestamp: at(s),
});
const toolUse = (s: number, name: string, input: Record<string, unknown>): Record_ => ({
  isSidechain: false,
  type: "assistant",
  message: { content: [{ type: "tool_use", id: `toolu_${s}`, name, input, caller: { type: "direct" } } as never] },
  timestamp: at(s),
});
const toolResult = (s: number): Record_ => ({
  isSidechain: false,
  type: "user",
  message: { content: [{ tool_use_id: `toolu_${s - 1}`, type: "tool_result", content: "ok" } as never] },
  timestamp: at(s),
});
const thinking = (s: number): Record_ => ({
  isSidechain: false,
  type: "assistant",
  message: { content: [{ type: "thinking", thinking: "", signature: "x" } as never] },
  timestamp: at(s),
});
const turnDuration = (s: number): Record_ => ({
  isSidechain: false,
  type: "system",
  subtype: "turn_duration",
  durationMs: 5203,
  timestamp: at(s),
} as Record_);
const interrupt = (s: number): Record_ => ({
  isSidechain: false,
  type: "user",
  message: { content: [{ type: "text", text: "[Request interrupted by user]" }] },
  timestamp: at(s),
});

const run = (records: Record_[]) => {
  const t = new Turns(ctx);
  return { t, events: records.flatMap((r) => t.push(r)) };
};

describe("Tail", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sear-tail-"));
  after(() => rmSync(dir, { recursive: true, force: true }));

  test("starts at the file's end, holds a partial line, skips bad JSON", () => {
    const file = path.join(dir, "a.jsonl");
    writeFileSync(file, '{"old":1}\n');
    const tail = new Tail(file);
    assert.deepEqual(tail.read(), []);
    appendFileSync(file, '{"n":1}\nnot json\n{"n":2');
    assert.deepEqual(tail.read(), [{ n: 1 }]);
    assert.deepEqual(tail.read(), []);
    appendFileSync(file, "}\n");
    assert.deepEqual(tail.read(), [{ n: 2 }]);
  });

  test("resets when the file shrinks; a missing file reads from its start once it appears", () => {
    const file = path.join(dir, "b.jsonl");
    const tail = new Tail(file);
    assert.deepEqual(tail.read(), []);
    writeFileSync(file, '{"n":1}\n{"n":2}\n');
    assert.deepEqual(tail.read(), [{ n: 1 }, { n: 2 }]);
    writeFileSync(file, '{"n":3}\n');
    assert.deepEqual(tail.read(), [{ n: 3 }]);
  });
});

describe("Turns", () => {
  test("a terminal turn: prompt, tool_use, tool_result, turn_duration", () => {
    const { t, events } = run([
      prompt(0, "<command-name>/sear</command-name>\n<command-args>resume demo</command-args>"),
      thinking(1),
      toolUse(2, "Read", { file_path: "C:\\Users\\Nick\\Projects\\sear\\README.md" }),
      toolResult(3),
      toolUse(4, "mcp__plugin_sear_sear__reply", { text: "hi" }),
      toolResult(5),
      turnDuration(26),
    ]);
    assert.deepEqual(events, [
      { type: "busy", on: true },
      { type: "step", label: "Read sear/README.md", verb: "Read", target: "sear/README.md", at: at(2), id: "toolu_2" },
      { type: "turn", start: at(0), steps: [{ label: "Read sear/README.md", verb: "Read", target: "sear/README.md", at: at(2), id: "toolu_2" }], ms: 26000 },
      { type: "busy", on: false },
    ]);
    assert.equal(t.busy, false);
    assert.deepEqual(t.steps, []);
  });

  test("a <channel> site message starts a turn though it is a meta record", () => {
    const { t, events } = run([channel(0), toolUse(1, "mcp__plugin_sear_sear__show", { q: 6, opt: "a" })]);
    assert.deepEqual(events, [
      { type: "busy", on: true },
      { type: "step", label: "Pointed to Q6 · a", verb: "Pointed to", target: "Q6 · a", at: at(1), id: "toolu_1" },
    ]);
    assert.equal(t.start, at(0));
  });

  test("an interrupt ends the turn as interrupted", () => {
    const { events } = run([prompt(0, "go"), toolUse(3, "Grep", { pattern: "foo" }), interrupt(9)]);
    assert.deepEqual(events.at(-2), {
      type: "turn",
      start: at(0),
      steps: [{ label: "Searched foo", verb: "Searched", target: "foo", at: at(3), id: "toolu_3", meta: "interrupted", tone: "warn" }],
      ms: 9000,
      interrupted: true,
    });
    assert.deepEqual(events.at(-1), { type: "busy", on: false });
  });

  test("meta, hidden and sidechain records don't start turns or add steps", () => {
    const { t, events } = run([
      { ...prompt(0, "Base directory for this skill: …"), isMeta: true },
      prompt(1, "<local-command-caveat>The command below was run directly</local-command-caveat>"),
      prompt(2, "<command-name>/clear</command-name>\n<command-args></command-args>"),
      { ...toolUse(3, "Bash", { command: "ls" }), isSidechain: true },
      { ...prompt(4, "summary"), isCompactSummary: true },
      { type: "api-request-blob", message: { content: [{ type: "tool_use", name: "Bash", input: {} }] } } as Record_,
      turnDuration(5),
    ]);
    assert.deepEqual(events, []);
    assert.equal(t.busy, false);
  });

  test("a second prompt mid-turn keeps the turn going", () => {
    const { t } = run([prompt(0, "one"), toolUse(1, "Glob", { pattern: "*.ts" }), prompt(2, "two")]);
    assert.equal(t.start, at(0));
    assert.equal(t.steps.length, 1);
  });

  test("begin opens a turn at attach; flush ends it as interrupted", () => {
    const t = new Turns(ctx);
    assert.deepEqual(t.begin(at(0)), [{ type: "busy", on: true }]);
    assert.deepEqual(t.begin(at(1)), []);
    t.push(toolUse(2, "Read", { file_path: "a/b/c.ts" }));
    assert.deepEqual(t.flush(at(4)), [
      { type: "turn", start: at(0), steps: [{ label: "Read b/c.ts", verb: "Read", target: "b/c.ts", at: at(2), id: "toolu_2", meta: "interrupted", tone: "warn" }], ms: 4000, interrupted: true },
      { type: "busy", on: false },
    ]);
    assert.deepEqual(t.flush(), []);
  });
});

describe("Turns results", () => {
  const calls = (s: number, ...uses: [id: string, name: string, input: Record<string, unknown>][]): Record_ => ({
    type: "assistant",
    message: { content: uses.map(([id, name, input]) => ({ type: "tool_use", id, name, input })) },
    timestamp: at(s),
  });
  const results = (s: number, toolUseResult: unknown, ...blocks: [id: string, content: unknown, isError?: boolean][]): Record_ => ({
    type: "user",
    message: { content: blocks.map(([id, content, isError]) => ({ type: "tool_result", tool_use_id: id, content, ...(isError ? { is_error: true } : {}) })) },
    toolUseResult,
    timestamp: at(s),
  });
  // Recorded shape: a plain-string user record with origin.kind "task-notification".
  const notification = (s: number, id: string, status = "completed"): Record_ =>
    ({
      type: "user",
      origin: { kind: "task-notification" },
      message: { content: `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>toolu_x</tool-use-id>\n<status>${status}</status>\n<summary>done</summary>\n</task-notification>` },
      timestamp: at(s),
    }) as Record_;
  const failure = (name: string, input: Record<string, unknown>, content: unknown) => {
    const { events } = run([prompt(0, "go"), calls(1, ["c", name, input]), results(2, "Error: x", ["c", content, true])]);
    return events.at(-1);
  };

  test("parallel results update their own steps by id", () => {
    const { t, events } = run([
      prompt(0, "go"),
      calls(1, ["e1", "Edit", { file_path: "a/b.ts" }], ["e2", "Read", { file_path: "a/c.ts" }]),
      results(2, undefined, ["e2", "File does not exist. Note: your current working directory is C:\\x.", true], ["e1", "ok"]),
    ]);
    assert.deepEqual(events.slice(-1), [{ type: "result", id: "e2", meta: "not found", tone: "bad" }]);
    assert.deepEqual(
      t.steps.map((s) => [s.id, s.meta, s.tone]),
      [
        ["e1", undefined, undefined],
        ["e2", "not found", "bad"],
      ],
    );
  });

  test("each failure has a short reason", () => {
    const why = (name: string, input: Record<string, unknown>, content: unknown) => failure(name, input, content) as { meta: string; tone: string };
    assert.equal(why("Edit", {}, "The user doesn't want to proceed with this tool use. The tool use was rejected").meta, "denied");
    assert.equal(why("Bash", { command: "ls" }, "Permission for this action was denied by the Claude Code auto mode classifier.").meta, "denied");
    assert.equal(why("Bash", { command: "rm x" }, "PreToolUse:Bash hook error: [guard]: no").meta, "blocked by hook");
    assert.equal(why("Read", {}, [{ type: "text", text: "File does not exist." }]).meta, "not found");
    assert.equal(why("Grep", {}, "Path does not exist: C:\\x").meta, "not found");
    assert.equal(why("Edit", {}, "<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>").meta, "not read yet");
    assert.deepEqual(why("Bash", { command: "pnpm test" }, "Exit code 2\nno such file"), { type: "result", id: "c", meta: "exit 2", tone: "bad" });
    assert.equal(why("Read", {}, "<tool_use_error>This tool cannot read binary files.</tool_use_error>").meta, "failed");
    assert.deepEqual(why("Bash", { command: "sleep 9" }, "[Request interrupted by user for tool use]"), { type: "result", id: "c", meta: "interrupted", tone: "warn" });
  });

  test("grep, rg, diff and test exiting 1 found nothing; other commands failed", () => {
    for (const command of ["grep -r foo src", "cd x && rg foo", "diff a b", "test -f x", "[ -f x ]"]) {
      assert.deepEqual(failure("Bash", { command }, "Exit code 1\n"), { type: "result", id: "c", meta: "no matches", tone: "warn" }, command);
    }
    assert.deepEqual(failure("Bash", { command: "grep foo x" }, "Exit code 2\nx: No such file"), { type: "result", id: "c", meta: "exit 2", tone: "bad" });
    assert.deepEqual(failure("Bash", { command: "git log" }, "Exit code 1\n"), { type: "result", id: "c", meta: "exit 1", tone: "bad" });
  });

  test("a hidden tool shows up only when it fails", () => {
    const { t, events } = run([
      prompt(0, "go"),
      calls(1, ["r1", "mcp__plugin_sear_sear__reply", { text: "hi" }], ["r2", "mcp__plugin_sear_sear__reply", { text: "again" }]),
      results(2, undefined, ["r1", "sent"], ["r2", "disconnected after /clear: call attach again first", true]),
    ]);
    const step = { label: "Sent a reply", verb: "Sent a reply", at: at(1), id: "r2", meta: "failed", tone: "bad" };
    assert.deepEqual(events.slice(1), [{ type: "step", ...step }]);
    assert.deepEqual(t.steps, [step]);
  });

  test("a foreground agent's result adds its finish row with the duration", () => {
    const agent = calls(1, ["a", "Agent", { description: "Explore the bridge's step labels" }]);
    const done = { label: "Agent finished: explore the bridge's step labels", verb: "Agent finished:", detail: "explore the bridge's step labels" };
    const timed = run([prompt(0, "go"), agent, results(50, { status: "completed", totalDurationMs: 38_400 }, ["a", [{ type: "text", text: "report" }]])]);
    assert.deepEqual(timed.events.at(-1), { type: "step", ...done, at: at(50), meta: "0:38" });
    const untimed = run([prompt(0, "go"), agent, results(13, { status: "completed" }, ["a", "report"])]);
    assert.deepEqual(untimed.events.at(-1), { type: "step", ...done, at: at(13), meta: "0:12" });
  });

  test("background agents and commands finish from a task-notification in a later turn", () => {
    const { t, events } = run([
      prompt(0, "go"),
      calls(1, ["a", "Agent", { description: "Map the bridge" }]),
      results(2, { isAsync: true, status: "async_launched", agentId: "ag1", description: "Map the bridge" }, ["a", "Async agent launched successfully."]),
      calls(3, ["b", "Bash", { command: "cd x && pnpm test", description: "Run tests", run_in_background: true }]),
      results(4, { stdout: "", backgroundTaskId: "bg1" }, ["b", "Command running in background with ID: bg1."]),
      turnDuration(5),
      notification(40, "ag1"),
      notification(41, "nope"),
      notification(57, "bg1", "failed"),
      turnDuration(58),
      notification(59, "ag1"),
    ]);
    const turns = events.filter((e) => e.type === "turn");
    assert.deepEqual(
      turns[0].type === "turn" && turns[0].steps.map((s) => s.label),
      ["Started an agent to map the bridge", "Ran pnpm to run tests"],
    );
    assert.deepEqual(turns[1], {
      type: "turn",
      start: at(40),
      steps: [
        { label: "Agent finished: map the bridge", verb: "Agent finished:", detail: "map the bridge", at: at(40), meta: "0:39" },
        { label: "Command finished pnpm", verb: "Command finished", target: "pnpm", at: at(57), meta: "0:54", tone: "bad" },
      ],
      ms: 18000,
    });
    assert.equal(turns.length, 2);
    assert.equal(t.busy, false);
  });

  describe("counts", () => {
    const meta = (name: string, input: Record<string, unknown>, toolUseResult: unknown) => {
      const { t, events } = run([prompt(0, "go"), calls(1, ["c", name, input]), results(2, toolUseResult, ["c", "ok"])]);
      const s = t.steps[0];
      if (s?.meta) assert.deepEqual(events.at(-1), { type: "result", id: "c", meta: s.meta, ...(s.tone ? { tone: s.tone } : {}) });
      return s?.tone ? [s.meta, s.tone] : s?.meta;
    };
    const grep = { pattern: "foo" };
    const patch = (...lines: string[]) => ({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, lines });

    test("grep and glob, from recorded shapes, prefer totals over head-limited counts", () => {
      assert.equal(meta("Grep", grep, { mode: "files_with_matches", filenames: ["a.ts"], numFiles: 23, totalFiles: 23 }), "23 files");
      assert.equal(meta("Grep", grep, { mode: "files_with_matches", filenames: ["a.ts"], numFiles: 20, totalFiles: 78, appliedLimit: 20 }), "78 files");
      assert.equal(meta("Grep", grep, { mode: "files_with_matches", filenames: ["a.ts"], numFiles: 1 }), "1 file");
      assert.deepEqual(meta("Grep", grep, { mode: "files_with_matches", filenames: [], numFiles: 0 }), ["0 files", "warn"]);
      assert.equal(meta("Grep", grep, { mode: "content", numFiles: 0, filenames: [], content: "19:x", numLines: 8, totalLines: 8 }), "8 lines");
      assert.equal(meta("Grep", grep, { mode: "content", numFiles: 0, filenames: [], content: "x", numLines: 15, totalLines: 16, appliedLimit: 15 }), "16 lines");
      assert.equal(meta("Grep", grep, { mode: "count", numFiles: 210, filenames: [], content: "a:5", numMatches: 1338 }), "1338 matches");
      assert.equal(meta("Glob", grep, { filenames: ["a"], durationMs: 3, numFiles: 4, truncated: false }), "4 files");
      assert.equal(meta("Glob", grep, { filenames: ["a"], durationMs: 59, numFiles: 100, truncated: true, totalMatches: 450, countIsComplete: true }), "450 files");
      assert.equal(meta("Glob", grep, { filenames: ["a"], durationMs: 59, numFiles: 100, truncated: true }), "100+ files");
      assert.deepEqual(meta("Glob", grep, { filenames: [], durationMs: 2, numFiles: 0, truncated: false }), ["0 files", "warn"]);
    });

    test("edits and writes count their patch lines", () => {
      const file = { file_path: "src/a.ts" };
      const edit = { filePath: "src/a.ts", oldString: "a", newString: "b", originalFile: "", replaceAll: false, userModified: false };
      assert.equal(meta("Edit", file, { ...edit, structuredPatch: [patch(" x", "-a", "-b", "+c", "+d", "+e", " y")] }), "+3 −2");
      assert.equal(meta("Edit", file, { ...edit, structuredPatch: [patch("-a", "+b"), patch("+c")] }), "+2 −1");
      assert.equal(meta("Write", file, { type: "create", filePath: "src/a.ts", content: "a\nb\nc\n", structuredPatch: [], originalFile: null }), "+3");
      assert.equal(meta("Write", file, { type: "create", filePath: "src/a.ts", content: "a\nb", structuredPatch: [], originalFile: null }), "+2");
      assert.equal(meta("Write", file, { type: "update", filePath: "src/a.ts", content: "c", structuredPatch: [patch("-a", "-b", "+c")], originalFile: "a\nb" }), "+1 −2");
    });

    test("web searches count their hits, not Claude's commentary", () => {
      const hits = (n: number) => ({ tool_use_id: "srvtoolu_1", content: Array.from({ length: n }, (_, i) => ({ title: `t${i}`, url: `https://x/${i}` })) });
      assert.equal(meta("WebSearch", { query: "q" }, { query: "q", results: [hits(9), "Summary…"], durationSeconds: 7, searchCount: 1 }), "9 results");
      assert.equal(meta("WebSearch", { query: "q" }, { query: "q", results: [hits(10), hits(9), "s"], durationSeconds: 7, searchCount: 2 }), "19 results");
      assert.deepEqual(meta("WebSearch", { query: "q" }, { query: "q", results: ["nothing"], durationSeconds: 1, searchCount: 0 }), ["0 results", "warn"]);
    });

    test("no count for other tools, friendly steps, or odd shapes", () => {
      const p = [patch("-a", "+b")];
      assert.equal(meta("Read", { file_path: "a.ts" }, { type: "text", file: { numLines: 9 } }), undefined);
      assert.equal(meta("WebFetch", { url: "https://x" }, { bytes: 9, code: 200, result: "x" }), undefined);
      assert.equal(meta("Bash", { command: "ls" }, { stdout: "a\nb", stderr: "" }), undefined);
      assert.equal(meta("Edit", { file_path: `${ctx.sessionsDir}\\demo\\session.json` }, { structuredPatch: p }), undefined);
      for (const odd of [undefined, null, "Error", 7, [], {}, { mode: "files_with_matches", numFiles: "3" }, { numFiles: -1 }, { numFiles: 1.5 }]) {
        assert.equal(meta("Grep", grep, odd), undefined, JSON.stringify(odd));
      }
      for (const odd of [{ structuredPatch: "x" }, { structuredPatch: [null] }, { structuredPatch: [{ lines: "+a" }] }, { structuredPatch: [] }, { type: "create", content: 3 }]) {
        assert.equal(meta("Edit", { file_path: "a.ts" }, odd), undefined, JSON.stringify(odd));
      }
      for (const odd of [{ results: "x" }, { results: null }, { truncated: true }]) {
        assert.equal(meta("WebSearch", { query: "q" }, odd), undefined, JSON.stringify(odd));
        assert.equal(meta("Glob", grep, odd), undefined, JSON.stringify(odd));
      }
    });
  });

  test("an interrupt marks only the calls still waiting", () => {
    const { events } = run([
      prompt(0, "go"),
      calls(1, ["g", "Grep", { pattern: "foo" }], ["s", "Bash", { command: "sleep 60" }], ["h", "TodoWrite", {}]),
      results(2, undefined, ["g", "a.ts"]),
      interrupt(9),
    ]);
    const turn = events.at(-2);
    assert.ok(turn?.type === "turn");
    assert.deepEqual(
      turn.steps.map((s) => [s.id, s.meta, s.tone]),
      [
        ["g", undefined, undefined],
        ["s", "interrupted", "warn"],
      ],
    );
  });
});

describe("stepLabel", () => {
  const label = (name: string, input: Record<string, unknown>) => stepLabel(name, input, ctx)?.label ?? null;
  const step = (name: string, input: Record<string, unknown>) => stepLabel(name, input, ctx);

  test("session.json edits save the session, matched across slashes and case", () => {
    assert.deepEqual(step("Edit", { file_path: `${S}\\session.json`, old_string: "a", new_string: "b" }), {
      label: "Saved the session",
      verb: "Saved the session",
    });
    assert.equal(label("Write", { file_path: "c:/users/nick/sear/sessions/DEMO/session.json", content: "{}" }), "Saved the session");
    assert.equal(label("MultiEdit", { file_path: `${S}\\session.json`, edits: [] }), "Saved the session");
    assert.equal(label("Edit", { file_path: "C:\\Users\\Nick\\Sear\\sessions\\other\\session.json" }), "Edited other/session.json");
  });

  test("preview edits update the Qn mock from a Q marker, else the mock", () => {
    assert.equal(label("Edit", { file_path: `${S}\\preview.spec.js`, old_string: "x", new_string: "// Q7 option b\n" }), "Updated the Q7 mock");
    assert.equal(label("Write", { file_path: `${S}\\preview.mock.css`, content: "/* Q12 */ .a{}" }), "Updated the Q12 mock");
    assert.equal(label("Edit", { file_path: `${S}\\preview.data.js`, old_string: "Q3a", new_string: "y" }), "Updated the mock");
    assert.equal(label("MultiEdit", { file_path: `${S}\\preview.spec.js`, edits: [{ old_string: "a", new_string: "Q2" }] }), "Updated the Q2 mock");
  });

  test("Sear scripts read as session actions; log-chat alone is hidden", () => {
    const P = '"C:\\Users\\Nick\\Projects\\Websites\\sear\\plugin';
    assert.deepEqual(step("Bash", { command: `node ${P}\\preview\\check-preview.js" "${S}"` }), { label: "Checked the mock", verb: "Checked the mock" });
    assert.equal(
      label("Bash", { command: `node ${P}\\scripts\\render-md.js" "${S}" && node ${P}\\scripts\\log-chat.js" demo terminal <<'EOF'\nhi\nEOF` }),
      "Saved the session",
    );
    assert.equal(label("Bash", { command: `node ${P}\\scripts\\log-chat.js" demo terminal <<'EOF'\nQ5 is next; then ok\nEOF` }), null);
    assert.equal(label("Bash", { command: `cd /tmp && node ${P}\\scripts\\log-chat.js" demo user "hi"` }), null);
    assert.equal(label("Bash", { command: `node ${P}\\scripts\\log-chat.js" demo user hi && ls`, description: "List" }), "Ran ls to list");
  });

  test("Sear's own tools, ToolSearch and TodoWrite are hidden", () => {
    for (const n of ["reply", "choice", "attach", "detach"]) assert.equal(label(`mcp__plugin_sear_sear__${n}`, {}), null);
    assert.equal(label("ToolSearch", { query: "x" }), null);
    assert.equal(label("TodoWrite", {}), null);
    assert.deepEqual(step("mcp__plugin_sear_sear__show", { q: 4 }), { label: "Pointed to Q4", verb: "Pointed to", target: "Q4" });
    assert.deepEqual(step("mcp__plugin_sear_sear__show", { q: 4, opt: "b1" }), { label: "Pointed to Q4 · b1", verb: "Pointed to", target: "Q4 · b1" });
  });

  test("identifiers are targets", () => {
    assert.deepEqual(step("Edit", { file_path: "C:\\a\\b\\c.ts" }), { label: "Edited b/c.ts", verb: "Edited", target: "b/c.ts" });
    assert.deepEqual(step("Write", { file_path: "/x/y/z.md" }), { label: "Wrote y/z.md", verb: "Wrote", target: "y/z.md" });
    assert.deepEqual(step("Read", { file_path: "C:\\a\\b\\c.ts" }), { label: "Read b/c.ts", verb: "Read", target: "b/c.ts" });
    assert.equal(label("NotebookEdit", { notebook_path: "/n/b.ipynb" }), "Edited n/b.ipynb");
    assert.deepEqual(step("Glob", { pattern: "**/*.ts" }), { label: "Searched **/*.ts", verb: "Searched", target: "**/*.ts" });
    assert.equal(label("Grep", { pattern: "foo" }), "Searched foo");
    assert.deepEqual(step("Skill", { skill: "belay" }), { label: "Loaded belay", verb: "Loaded", target: "belay" });
    assert.deepEqual(step("Skill", {}), { label: "Loaded a skill", verb: "Loaded a skill" });
    assert.deepEqual(step("Workflow", {}), { label: "Started a workflow", verb: "Started a workflow" });
    assert.deepEqual(step("WebSearch", { query: "next 16" }), { label: "Searched the web for next 16", verb: "Searched the web for", target: "next 16" });
    assert.deepEqual(step("WebFetch", { url: "https://x.dev" }), { label: "Fetched https://x.dev", verb: "Fetched", target: "https://x.dev" });
    assert.deepEqual(step("mcp__claude_ai_Claude_Docs__batch", {}), {
      label: "Used batch in claude_ai_Claude_Docs",
      verb: "Used",
      target: "batch",
      detail: "in claude_ai_Claude_Docs",
    });
    assert.deepEqual(step("Frobnicate", {}), { label: "Used Frobnicate", verb: "Used", target: "Frobnicate" });
  });

  test("Bash chips its first real command and says what it was for", () => {
    assert.deepEqual(step("Bash", { command: "cd x && pnpm test", description: "Run tests" }), {
      label: "Ran pnpm to run tests",
      verb: "Ran",
      target: "pnpm",
      detail: "to run tests",
    });
    assert.deepEqual(step("Bash", { command: "pnpm test" }), { label: "Ran pnpm", verb: "Ran", target: "pnpm" });
    assert.equal(label("Bash", { command: "git status", description: "Show working tree status" }), "Ran git to show working tree status");
    assert.deepEqual(step("Bash", {}), { label: "Ran a command", verb: "Ran a command" });
  });

  test("agents say what they are for", () => {
    assert.deepEqual(step("Agent", { description: "Explore the bridge's step labels" }), {
      label: "Started an agent to explore the bridge's step labels",
      verb: "Started an agent",
      detail: "to explore the bridge's step labels",
    });
    assert.deepEqual(step("Task", {}), { label: "Started an agent", verb: "Started an agent" });
  });
});

describe("lower", () => {
  test("lowercases the first word, not acronyms or inner-capital names", () => {
    assert.equal(lower("Run tests"), "run tests");
    assert.equal(lower("CSS tweak for the rail"), "CSS tweak for the rail");
    assert.equal(lower("PowerShell check"), "PowerShell check");
    assert.equal(lower("List"), "list");
    assert.equal(lower(""), "");
  });
});

describe("permission mode", () => {
  const modeEntry = (mode: string, sidechain = false): Record_ => ({ type: "permission-mode", permissionMode: mode, isSidechain: sidechain }) as Record_;
  const exitPlan = (s: number): Record_ => toolUse(s, "ExitPlanMode", { plan: "p" });
  const exitResult = (s: number, isError = false): Record_ => ({
    type: "user",
    message: { content: [{ tool_use_id: `toolu_${s - 1}`, type: "tool_result", content: "ok", ...(isError ? { is_error: true } : {}) } as never] },
    timestamp: at(s),
  });

  test("a permission-mode entry sets it and a user record's permissionMode updates it", () => {
    const t = new Turns(ctx);
    t.push(modeEntry("plan"));
    assert.equal(t.mode, "plan");
    t.push({ ...prompt(1, "go"), permissionMode: "acceptEdits" });
    assert.equal(t.mode, "acceptEdits");
  });

  test("sidechain records are ignored", () => {
    const t = new Turns(ctx);
    t.push(modeEntry("default"));
    t.push(modeEntry("plan", true));
    assert.equal(t.mode, "default");
  });

  test("a successful ExitPlanMode clears it; an error result doesn't", () => {
    const t = new Turns(ctx);
    t.push(modeEntry("plan"));
    t.push(prompt(0, "go"));
    t.push(exitPlan(1));
    t.push(exitResult(2, true));
    assert.equal(t.mode, "plan");
    t.push(exitPlan(3));
    t.push(exitResult(4));
    assert.equal(t.mode, undefined);
  });

  test("lastMode reads the file's last permissionMode", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sear-mode-"));
    after(() => rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "t.jsonl");
    assert.equal(lastMode(file), undefined);
    writeFileSync(file, '{"type":"permission-mode","permissionMode":"plan"}\n{"type":"user","permissionMode":"default"}\n{"type":"assistant"}\n');
    assert.equal(lastMode(file), "default");
    writeFileSync(file, '{"type":"assistant"}\n');
    assert.equal(lastMode(file), undefined);
  });
});
