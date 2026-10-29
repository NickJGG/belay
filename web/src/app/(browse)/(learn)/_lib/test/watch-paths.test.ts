import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { courseIgnored, courseLocate } from "../watch-paths.ts";

const root = path.join(os.tmpdir(), "belay-learning");

test("the course watcher reports visible paths only", () => {
  assert.deepEqual(courseLocate(root, path.join(root, "llm", "knowledge", "a.md")), ["llm", "knowledge/a.md"]);
  assert.deepEqual(courseLocate(root, path.join(root, "llm", "work", "x", "y.py").replaceAll("\\", "/")), ["llm", "work/x/y.py"]);
  assert.equal(courseLocate(root, path.join(root, "llm", "exercises", "e1.md")), null);
  const ignored = courseIgnored(root);
  assert.equal(ignored(root), false);
  assert.equal(ignored(path.join(root, "llm")), false);
  assert.equal(ignored(path.join(root, "llm", "knowledge")), false);
  assert.equal(ignored(path.join(root, "llm", "rubrics")), true);
  assert.equal(ignored(path.join(root, ".obsidian")), true);
});
