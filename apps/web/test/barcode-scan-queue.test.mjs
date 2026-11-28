import assert from "node:assert/strict";
import test from "node:test";
import {
  BarcodeScanQueue,
  submitBarcodeForm,
} from "../src/components/barcode/barcode-scan-queue.ts";

test("one queued submit runs once and repeated rapid scans run sequentially", async () => {
  const queue = new BarcodeScanQueue();
  const scans = [];
  let quantity = 0;
  let active = 0;
  let maximumActive = 0;
  const processScan = async (barcode) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    scans.push(barcode);
    await new Promise((resolve) => setTimeout(resolve, 5));
    quantity += 1;
    active -= 1;
  };

  let prevented = 0;
  const submit = (value) =>
    submitBarcodeForm(
      {
        preventDefault: () => {
          prevented += 1;
        },
      },
      value,
      queue,
      processScan,
    );
  const single = submit(" SKU-1 ");
  await single;
  assert.equal(quantity, 1);

  const first = submit("SKU-1");
  assert.equal(submit("SKU-1"), first);
  submit("SKU-1");
  submit("   ");
  await first;

  assert.deepEqual(scans, ["SKU-1", "SKU-1", "SKU-1", "SKU-1"]);
  assert.equal(quantity, 4);
  assert.equal(maximumActive, 1);
  assert.equal(prevented, 5);
});
