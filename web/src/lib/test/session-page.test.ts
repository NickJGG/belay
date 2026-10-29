import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyResult, openPrompts, parseChat, permissionLine, permView, placeSteps, toolLabel, toStep, type ChatEntry } from "../chat.ts";

describe("chat", () => {
  const lines = (es: object[]) => es.map((e) => JSON.stringify({ at: "t", ...e })).join("\n");

  test("parseChat skips junk and a torn last line", () => {
    const text = `${lines([{ from: "claude", kind: "reply", text: "hi" }, { nope: 1 }])}\n{"from":"site","ki`;
    assert.deepEqual(parseChat(text), [{ at: "t", from: "claude", kind: "reply", text: "hi" }]);
  });

  const open = (es: object[]) => {
    const o = openPrompts(parseChat(lines(es)) as ChatEntry[]);
    return { choices: [...o.choices], permissions: [...o.permissions] };
  };

  test("a choice stays open until the site answers it or the terminal moves on", () => {
    assert.deepEqual(open([{ from: "claude", kind: "choice", id: "abc123" }]).choices, ["abc123"]);
    assert.deepEqual(
      open([{ from: "claude", kind: "choice", id: "abc123" }, { from: "site", kind: "choice", id: "abc123" }]).choices,
      [],
    );
    assert.deepEqual(
      open([{ from: "claude", kind: "choice", id: "abc123" }, { from: "terminal", kind: "chat", text: "x" }]).choices,
      [],
    );
    assert.deepEqual(
      open([{ from: "claude", kind: "choice", id: "abc123" }, { from: "claude", kind: "steps", steps: [] }]).choices,
      ["abc123"],
    );
  });

  test("a permission prompt closes on a site verdict or Claude's next message", () => {
    const p = { from: "claude", kind: "permission", request_id: "abcde" };
    assert.deepEqual(open([p]).permissions, ["abcde"]);
    assert.deepEqual(open([p, { from: "site", kind: "permission", request_id: "abcde" }]).permissions, []);
    assert.deepEqual(open([p, { from: "claude", kind: "reply", text: "done" }]).permissions, []);
  });

  const order = (es: object[]) => placeSteps(es as ChatEntry[]).map((e) => `${e.from}:${e.kind}`);
  const steps = (start: string, extra: object = {}) => ({ at: "2026-10-23T10:00:30Z", from: "claude", kind: "steps", start, steps: [{ label: "Saved the session", at: start }], ms: 30000, ...extra });

  test("placeSteps moves a turn's steps above the reply logged before them", () => {
    const es = [
      { at: "2026-10-23T09:59:00Z", from: "claude", kind: "reply", text: "earlier" },
      { at: "2026-10-23T10:00:00Z", from: "site", kind: "chat", text: "go" },
      { at: "2026-10-23T10:00:20Z", from: "claude", kind: "reply", text: "done" },
      { at: "2026-10-23T10:00:25Z", from: "claude", kind: "reply", text: "and more" },
      steps("2026-10-23T10:00:01Z"),
    ];
    assert.deepEqual(order(es), ["claude:reply", "site:chat", "claude:steps", "claude:reply", "claude:reply"]);
  });

  test("placeSteps puts a terminal turn's steps after your message, above Claude's", () => {
    // log-chat writes both terminal entries late, in the turn's save; the user's prompt came first.
    const es = [
      { at: "2026-10-23T10:00:20Z", from: "terminal", kind: "chat", text: "hm" },
      { at: "2026-10-23T10:00:20Z", from: "claude", kind: "terminal", text: "ok" },
      steps("2026-10-23T10:00:00Z"),
    ];
    assert.deepEqual(order(es), ["terminal:chat", "claude:steps", "claude:terminal"]);
  });

  test("placeSteps leaves an interrupted turn with no reply where it is", () => {
    const es = [
      { at: "2026-10-23T09:59:00Z", from: "claude", kind: "reply", text: "earlier" },
      { at: "2026-10-23T10:00:00Z", from: "site", kind: "chat", text: "go" },
      steps("2026-10-23T10:00:01Z", { interrupted: true }),
      { at: "2026-10-23T10:01:00Z", from: "claude", kind: "reply", text: "next turn" },
    ];
    assert.deepEqual(order(es), ["claude:reply", "site:chat", "claude:steps", "claude:reply"]);
  });

  test("toStep keeps a step's known string parts and drops the rest", () => {
    assert.deepEqual(toStep({ label: "Ran pnpm to run tests", at: "t1", verb: "Ran", target: "pnpm", detail: "to run tests", type: "step", x: 1 }), {
      label: "Ran pnpm to run tests",
      at: "t1",
      verb: "Ran",
      target: "pnpm",
      detail: "to run tests",
    });
    assert.deepEqual(toStep({ label: "Read b/c.ts", at: "t2" }), { label: "Read b/c.ts", at: "t2" });
    assert.deepEqual(toStep({ label: "x", at: "t3", verb: 4, target: "", detail: null }), { label: "x", at: "t3" });
    assert.deepEqual(toStep(null), { label: "", at: "" });
    assert.deepEqual(toStep({ label: "Read a", at: "t4", id: "toolu_1", meta: "not found", tone: "bad" }), {
      label: "Read a",
      at: "t4",
      id: "toolu_1",
      meta: "not found",
      tone: "bad",
    });
    assert.deepEqual(toStep({ label: "x", at: "t5", meta: "0 files", tone: "red" }), { label: "x", at: "t5", meta: "0 files" });
  });

  test("applyResult sets meta and tone on the step with that id", () => {
    const turn = { start: "t0", steps: [toStep({ label: "a", at: "t1", id: "e1" }), toStep({ label: "b", at: "t2", id: "e2", tone: "warn", meta: "x" })] };
    assert.deepEqual(applyResult(turn, { type: "result", id: "e2", meta: "exit 1", tone: "bad" }).steps[1], {
      label: "b",
      at: "t2",
      id: "e2",
      meta: "exit 1",
      tone: "bad",
    });
    assert.deepEqual(applyResult(turn, { type: "result", id: "e2", meta: "done" }).steps[1], { label: "b", at: "t2", id: "e2", meta: "done" });
    assert.equal(applyResult(turn, { type: "result", id: "nope", meta: "x" }), turn);
    assert.equal(applyResult(turn, { type: "result", id: "e1" }), turn);
  });
});

describe("permission cards", () => {
  test("toolLabel", () => {
    assert.deepEqual(toolLabel("mcp__plugin_belay_belay__reply"), { label: "belay · reply", server: "belay", tool: "reply" });
    assert.deepEqual(toolLabel("mcp__claude_ai_Claude_Docs__batch"), { label: "claude_ai_Claude_Docs · batch", server: "claude_ai_Claude_Docs", tool: "batch" });
    assert.deepEqual(toolLabel("Bash"), { label: "Bash", tool: "Bash" });
  });

  test("permissionLine", () => {
    assert.equal(permissionLine("mcp__plugin_belay_belay__reply", "The only way to answer…"), "Post a message to this drawer.");
    assert.equal(permissionLine("mcp__claude_ai_Claude_Docs__batch", "Create a doc"), "");
    assert.equal(permissionLine("Bash", "List files"), "List files");
  });

  test("permView: Belay reply and choice render as Markdown", () => {
    const reply = JSON.stringify({ text: "See `C:\\Users\\Nick\\x.md`" });
    assert.ok(reply.includes("C:\\\\Users"));
    assert.deepEqual(permView("mcp__plugin_belay_belay__reply", reply), { kind: "markdown", text: "See `C:\\Users\\Nick\\x.md`" });
    assert.deepEqual(permView("mcp__plugin_belay_belay__choice", JSON.stringify({ prompt: "Which?", options: ["a", "b"] })), {
      kind: "markdown",
      text: "Which?",
      options: ["a", "b"],
    });
  });

  test("permView: Bash and Edit", () => {
    assert.deepEqual(permView("Bash", JSON.stringify({ command: "ls -la", description: "List" })), { kind: "command", command: "ls -la", description: "List" });
    assert.deepEqual(permView("Edit", JSON.stringify({ file_path: "a.ts", old_string: "x", new_string: "y" })), {
      kind: "edit",
      path: "a.ts",
      oldText: "x",
      newText: "y",
    });
  });

  test("permView: other tools as fields, junk as raw", () => {
    assert.deepEqual(permView("Write", JSON.stringify({ file_path: "a.ts", n: 2, o: { x: 1 } })), {
      kind: "fields",
      fields: [
        ["file_path", "a.ts"],
        ["n", "2"],
        ["o", '{"x":1}'],
      ],
    });
    assert.deepEqual(permView("Bash", "{not json"), { kind: "raw", text: "{not json" });
    assert.deepEqual(permView("Bash", "[1,2]"), { kind: "raw", text: "[1,2]" });
    assert.deepEqual(permView("Bash", JSON.stringify({ timeout: 5 })), { kind: "fields", fields: [["timeout", "5"]] });
  });
});
