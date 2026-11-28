import assert from "node:assert/strict";
import test from "node:test";
import { ReorderingScheduler } from "../dist/inventory/reordering/reordering.scheduler.js";

test("reorder evaluation runs every five minutes without overlapping and clears its timer", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let scheduledCallback;
  let scheduledDelay;
  let clearedTimer;
  const timer = { unref() {} };
  globalThis.setInterval = (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return timer;
  };
  globalThis.clearInterval = (handle) => {
    clearedTimer = handle;
  };

  try {
    let evaluations = 0;
    let finishEvaluation;
    const scheduler = new ReorderingScheduler({
      evaluateAll: () => {
        evaluations += 1;
        return new Promise((resolve) => {
          finishEvaluation = resolve;
        });
      },
    });

    scheduler.onModuleInit();
    assert.equal(scheduledDelay, 5 * 60 * 1000);
    scheduledCallback();
    scheduledCallback();
    assert.equal(
      evaluations,
      1,
      "a second tick must not overlap the active pass",
    );

    finishEvaluation({ failed: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    scheduledCallback();
    assert.equal(
      evaluations,
      2,
      "the next scheduled tick can retry after completion",
    );
    finishEvaluation({ failed: 0 });
    await new Promise((resolve) => setImmediate(resolve));

    scheduler.onModuleDestroy();
    assert.equal(clearedTimer, timer);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
