import assert from "node:assert/strict";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import test from "node:test";
import {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
} from "../dist/procurement/purchase-orders.dto.js";

test("purchase order DTO accepts decimal strings and bounded line arrays", () => {
  const input = plainToInstance(CreatePurchaseOrderDto, {
    supplierId: "81b637d8-fcd2-4d75-97a1-8a5d01871a42",
    warehouseId: "81b637d8-fcd2-4d75-97a1-8a5d01871a43",
    currency: "NGN",
    lines: [
      {
        productId: "81b637d8-fcd2-4d75-97a1-8a5d01871a44",
        unitId: "81b637d8-fcd2-4d75-97a1-8a5d01871a45",
        quantity: "1.250000",
        unitCost: "250.5000",
      },
    ],
  });
  assert.deepEqual(validateSync(input), []);
});

test("purchase order DTO rejects floating point numbers, invalid currency, and empty lines", () => {
  const input = plainToInstance(CreatePurchaseOrderDto, {
    supplierId: "81b637d8-fcd2-4d75-97a1-8a5d01871a42",
    warehouseId: "81b637d8-fcd2-4d75-97a1-8a5d01871a43",
    currency: "naira",
    lines: [
      {
        productId: "81b637d8-fcd2-4d75-97a1-8a5d01871a44",
        unitId: "81b637d8-fcd2-4d75-97a1-8a5d01871a45",
        quantity: 1.25,
        unitCost: "12.12345",
      },
    ],
  });
  const invalid = new Set(validateSync(input).map((error) => error.property));
  assert.ok(invalid.has("currency"));
  assert.ok(invalid.has("lines"));
});

test("receipt DTO requires a positive decimal string for each order line", () => {
  const input = plainToInstance(CreateGoodsReceiptDto, {
    lines: [
      {
        purchaseOrderLineId: "81b637d8-fcd2-4d75-97a1-8a5d01871a46",
        quantity: "2.5",
      },
    ],
  });
  assert.deepEqual(validateSync(input), []);
});
