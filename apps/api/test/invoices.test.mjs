import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { Prisma } from "../dist/generated/prisma/client.js";
import { MembershipRole } from "../dist/generated/prisma/enums.js";
import {
  calculateInvoiceLine,
  currencyPrecision,
} from "../dist/sales/invoice-calculations.js";
import { renderInvoicePdf } from "../dist/sales/invoice-pdf.js";
import { roleHasCapability } from "../dist/organizations/access-policy.js";
import {
  ReversePaymentDto,
  VoidInvoiceDto,
} from "../dist/sales/invoices.dto.js";

const decimal = (value) => new Prisma.Decimal(value);

test("invoice line calculation applies line discount before configurable tax using Decimal", () => {
  const result = calculateInvoiceLine({
    quantity: decimal("10"),
    unitPrice: decimal("5000"),
    discountAmount: decimal("5000"),
    taxRatePercent: decimal("5"),
    currency: "NGN",
  });
  assert.equal(result.gross.toFixed(4), "50000.0000");
  assert.equal(result.lineSubtotal.toFixed(4), "45000.0000");
  assert.equal(result.tax.toFixed(4), "2250.0000");
  assert.equal(result.total.toFixed(4), "47250.0000");
});

test("invoice tax rounds half-up to currency minor units", () => {
  const ngn = calculateInvoiceLine({
    quantity: decimal("1"),
    unitPrice: decimal("1"),
    discountAmount: decimal("0"),
    taxRatePercent: decimal("0.5"),
    currency: "NGN",
  });
  const jpy = calculateInvoiceLine({
    quantity: decimal("1"),
    unitPrice: decimal("1"),
    discountAmount: decimal("0"),
    taxRatePercent: decimal("50"),
    currency: "JPY",
  });
  assert.equal(ngn.tax.toFixed(4), "0.0100");
  assert.equal(jpy.tax.toFixed(4), "1.0000");
  assert.equal(currencyPrecision("KWD"), 3);
});

test("invoice calculations reject out-of-range tax, excessive discount, and invalid currency", () => {
  const base = {
    quantity: decimal("1"),
    unitPrice: decimal("10"),
    discountAmount: decimal("0"),
    taxRatePercent: decimal("0"),
    currency: "NGN",
  };
  assert.throws(() =>
    calculateInvoiceLine({ ...base, taxRatePercent: decimal("100.000001") }),
  );
  assert.throws(() =>
    calculateInvoiceLine({ ...base, discountAmount: decimal("10.01") }),
  );
  assert.throws(() => currencyPrecision("US"));
});

test("invoice PDF output is validly framed and paginates long invoices", () => {
  const content = renderInvoicePdf([
    "Invoice (draft) \\ sample",
    ...Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`),
  ]).toString("ascii");
  assert.ok(content.startsWith("%PDF-1.4"));
  assert.ok(content.endsWith("%%EOF\n"));
  assert.equal((content.match(/\/Type \/Page /g) ?? []).length, 2);
  assert.ok(content.includes("Invoice \\(draft\\) \\\\ sample"));
});

test("finance routes are allowed for finance and owners, not sales or warehouse roles", () => {
  assert.equal(roleHasCapability(MembershipRole.OWNER, "finance:read"), true);
  assert.equal(roleHasCapability(MembershipRole.FINANCE, "finance:read"), true);
  assert.equal(
    roleHasCapability(MembershipRole.FINANCE, "finance:write"),
    true,
  );
  assert.equal(roleHasCapability(MembershipRole.SALES, "finance:read"), false);
  assert.equal(
    roleHasCapability(MembershipRole.WAREHOUSE_CLERK, "finance:write"),
    false,
  );
});

test("invoice void and payment reversal DTOs reject blank audit reasons", () => {
  assert.ok(
    validateSync(plainToInstance(VoidInvoiceDto, { reason: "  " })).length > 0,
  );
  assert.ok(
    validateSync(plainToInstance(ReversePaymentDto, { reason: "" })).length > 0,
  );
  assert.equal(
    validateSync(
      plainToInstance(VoidInvoiceDto, { reason: "Customer request" }),
    ).length,
    0,
  );
});
