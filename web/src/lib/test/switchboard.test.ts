import assert from "node:assert/strict";
import { test } from "node:test";
import { Switchboard } from "../switchboard.ts";

/** A switchboard whose starts and stops are logged. */
function logged(fail: string[] = []) {
  const log: string[] = [];
  const errors: string[] = [];
  const board = new Switchboard<string>(
    async (id) => {
      log.push(`start ${id}`);
      if (fail.includes(id)) throw new Error(`no ${id}`);
      return () => log.push(`stop ${id}`);
    },
    (id, err) => errors.push(`${id}: ${(err as Error).message}`),
  );
  return { board, log, errors };
}

test("starts what's switched on and stops what's switched off, once each", async () => {
  const { board, log } = logged();
  await board.sync(["grill", "learn"]);
  assert.deepEqual(log, ["start grill", "start learn"]);
  await board.sync(["grill", "learn"]);
  assert.equal(log.length, 2);
  await board.sync(["grill"]);
  assert.deepEqual(log.slice(2), ["stop learn"]);
  assert.deepEqual(board.running(), ["grill"]);
  await board.sync(["grill", "learn"]);
  assert.deepEqual(log.slice(3), ["start learn"]);
});

test("a stop asked for while the start is still running waits for it, then stops", async () => {
  const { board, log } = logged();
  const starting = board.sync(["learn"]);
  const stopping = board.sync([]);
  await Promise.all([starting, stopping]);
  assert.deepEqual(log, ["start learn", "stop learn"]);
  assert.deepEqual(board.running(), []);
});

test("a start that fails is reported, and the rest still start", async () => {
  const { board, log, errors } = logged(["learn"]);
  await board.sync(["grill", "learn"]);
  assert.deepEqual(errors, ["learn: no learn"]);
  assert.deepEqual(log, ["start grill", "start learn"]);
  await board.sync(["grill"]);
  assert.deepEqual(log.slice(2), []);
});
