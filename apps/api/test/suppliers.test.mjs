import assert from "node:assert/strict";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import test from "node:test";
import { CreateSupplierDto } from "../dist/procurement/suppliers.dto.js";

test("supplier DTO accepts validated contact/address data and normalizes email", () => {
  const input = plainToInstance(CreateSupplierDto, {
    name: "North Supply",
    email: "ORDERS@NORTH.EXAMPLE",
    phone: "+234 801 234 5678",
    website: "https://north.example",
    countryCode: "ng",
  });
  assert.deepEqual(validateSync(input), []);
  assert.equal(input.email, "orders@north.example");
});

test("supplier DTO rejects invalid email, phone, URL, and country code", () => {
  const input = plainToInstance(CreateSupplierDto, {
    name: "North Supply",
    email: "not-an-email",
    phone: "call-me",
    website: "north.example",
    countryCode: "NGA",
  });
  const invalidFields = new Set(
    validateSync(input).flatMap((error) => error.property),
  );
  for (const field of ["email", "phone", "website", "countryCode"])
    assert.ok(invalidFields.has(field), `${field} should be invalid`);
});
