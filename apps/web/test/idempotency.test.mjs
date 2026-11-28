import assert from "node:assert/strict";
import test from "node:test";
import { commandKeyFor } from "../src/features/sales/idempotency.ts";

test("invoice command keys survive retries of the same payload", () => {
  let calls = 0;
  const createKey = () => `command-${++calls}`;
  const payload = { salesOrderId: "order-1", dueDate: "2026-11-30" };

  const initial = commandKeyFor(null, payload, createKey);
  const retry = commandKeyFor(initial, { ...payload }, createKey);

  assert.equal(retry.key, initial.key);
  assert.equal(calls, 1);
});

test("invoice command keys change when the submitted payload changes", () => {
  let calls = 0;
  const createKey = () => `command-${++calls}`;
  const initial = commandKeyFor(null, { notes: "first" }, createKey);
  const changed = commandKeyFor(initial, { notes: "edited" }, createKey);

  assert.notEqual(changed.key, initial.key);
  assert.equal(calls, 2);
});
