import assert from "node:assert/strict";
import test from "node:test";
import {
  addQuantities,
  divideQuantityExact,
  isAtMostQuantity,
  subtractQuantity,
} from "../src/features/procurement/decimal.ts";

test("quantity arithmetic keeps large values parseable without display separators", () => {
  assert.equal(addQuantities("999.5", "0.5"), "1000.000000");
  assert.equal(addQuantities("1200.25", "0.75"), "1201.000000");
  assert.equal(subtractQuantity("1200.1", "0.1"), "1200.000000");
  assert.equal(divideQuantityExact("1200", "3"), "400.000000");
  assert.equal(isAtMostQuantity("1000", subtractQuantity("1200", "100")), true);
});
