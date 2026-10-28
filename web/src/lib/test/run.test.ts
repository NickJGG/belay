import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { startRun } from "../run-process.ts";
import { inputPath, isInputSidecar, runCommand, type RunEvent } from "../run.ts";
import { listWork } from "../work.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-run-"));
process.env.LEARNING_ROOT = tmp;
after(() => rmSync(tmp, { recursive: true, force: true }));

const put = (rel: string, text: string) => {
  const abs = path.join(tmp, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
};

put("c/course.md", "---\ngoal: x\n---\n");

describe("run commands", () => {
  test("JS and TS run with node, Python unbuffered, by name from the file's folder", () => {
    for (const ext of ["ts", "js", "mjs", "cjs"]) {
      assert.deepEqual(runCommand(`work/sub/a.${ext}`), { cmd: "node", args: [`a.${ext}`] });
    }
    assert.deepEqual(runCommand("work/prefix-sums.py"), { cmd: "python", args: ["-u", "prefix-sums.py"] });
  });

  test("other files don't run", () => {
    for (const rel of ["work/notes.md", "work/a.tsx", "work/a.py.in", "work/a.txt", "work/ts"]) assert.equal(runCommand(rel), null, rel);
  });

  test("a file's input is its .in sidecar", () => {
    assert.equal(inputPath("work/prefix-sums.py"), "work/prefix-sums.py.in");
  });

  test("X.in is a sidecar only beside X", () => {
    assert.equal(isInputSidecar("a.py.in", ["a.py", "a.py.in"]), true);
    assert.equal(isInputSidecar("a.py.in", ["a.py.in"]), false);
    assert.equal(isInputSidecar(".in", ["", ".in"]), false);
    assert.equal(isInputSidecar("a.py", ["a.py", "a"]), false);
  });
});

describe("the work tree", () => {
  test("hides a sidecar but shows a lone .in", () => {
    put("c/work/a.py", "");
    put("c/work/a.py.in", "");
    put("c/work/data.in", "");
    put("c/work/sub/b.ts", "");
    put("c/work/sub/b.ts.in", "");
    assert.deepEqual(
      listWork("c").map((e) => e.path),
      ["work/sub", "work/sub/b.ts", "work/a.py", "work/data.in"],
    );
  });
});

const run = (abs: string, cap?: number) =>
  new Promise<RunEvent[]>((resolve) => {
    const events: RunEvent[] = [];
    startRun(abs, (e) => {
      events.push(e);
      if ("exit" in e) resolve(events);
    }, cap);
  });

const text = (events: RunEvent[], s: "out" | "err") =>
  events.flatMap((e) => ("s" in e && e.s === s ? [e.t] : [])).join("");

describe("a run", () => {
  test("streams stdout and stderr, then the exit code", async () => {
    const abs = put("c/work/r/out.ts", 'const n: number = 2;\nconsole.log("hi", n);\nconsole.error("oops");\nprocess.exitCode = 3;\n');
    const events = await run(abs);
    assert.equal(text(events, "out"), "hi 2\n");
    assert.equal(text(events, "err"), "oops\n");
    const end = events.at(-1)!;
    assert.ok("exit" in end && end.exit === 3 && end.ms >= 0);
  });

  test("runs in the file's folder with its .in on stdin", async () => {
    const abs = put("c/work/r/echo.js", 'const fs = require("fs");\nconsole.log(fs.readFileSync(0, "utf8").trim(), require("path").basename(process.cwd()));\n');
    put("c/work/r/echo.js.in", "from input\n");
    assert.equal(text(await run(abs), "out"), "from input r\n");
  });

  test("without a .in, stdin is closed", async () => {
    const abs = put("c/work/r/none.js", 'console.log(JSON.stringify(require("fs").readFileSync(0, "utf8")));\n');
    assert.equal(text(await run(abs), "out"), '""\n');
  });

  test("output past the cap kills it", async () => {
    const abs = put("c/work/r/flood.js", 'for (;;) process.stdout.write("x".repeat(1000) + "\\n");\n');
    const events = await run(abs, 20_000);
    assert.ok(text(events, "out").length <= 20_000);
    const end = events.at(-1)!;
    assert.ok("exit" in end && end.capped);
  });

  test("stop kills a program that never ends", async () => {
    const abs = put("c/work/r/loop.js", "setInterval(() => {}, 1000);\n");
    const events: RunEvent[] = [];
    const ended = new Promise<void>((resolve) => {
      const stop = startRun(abs, (e) => {
        events.push(e);
        if ("exit" in e) resolve();
      })!;
      setTimeout(stop, 200);
    });
    await ended;
    const end = events.at(-1)!;
    assert.ok("exit" in end && end.stopped);
  });

  test("stop kills the program's own children too", async () => {
    const abs = put(
      "c/work/r/parent.js",
      'const c = require("child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nconsole.log(c.pid);\nsetInterval(() => {}, 1000);\n',
    );
    const events: RunEvent[] = [];
    await new Promise<void>((resolve) => {
      const stop = startRun(abs, (e) => {
        events.push(e);
        if ("s" in e) stop();
        if ("exit" in e) resolve();
      })!;
    });
    const pid = Number(text(events, "out"));
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 40 && alive(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(alive(), false);
  });

  test("a file that doesn't run doesn't start", () => {
    assert.equal(startRun(put("c/work/r/n.md", ""), () => {}), null);
  });
});
