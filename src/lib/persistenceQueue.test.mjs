import assert from "node:assert/strict";
import test from "node:test";
import { PersistenceQueue } from "./persistenceQueue.ts";

test("persistence failures are reported and the latest value can be retried", async () => {
  const states = [];
  const saved = [];
  let fail = true;
  const queue = new PersistenceQueue(
    async (value) => {
      if (fail) throw new Error("quota");
      saved.push(value);
    },
    (state) => states.push(state),
    "Not saved"
  );

  assert.equal(await queue.enqueue("draft"), false);
  assert.deepEqual(states.at(-1), { status: "error", message: "Not saved" });
  fail = false;
  assert.equal(await queue.retry(), true);
  assert.deepEqual(saved, ["draft"]);
  assert.deepEqual(states.at(-1), { status: "saved" });
});

test("queued saves remain ordered and only the latest completion publishes saved", async () => {
  const states = [];
  const saved = [];
  const queue = new PersistenceQueue(
    async (value) => { saved.push(value); },
    (state) => states.push(state),
    "Not saved"
  );

  const first = queue.enqueue(1);
  const second = queue.enqueue(2);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(saved, [1, 2]);
  assert.equal(states.filter(({ status }) => status === "saved").length, 1);
});
