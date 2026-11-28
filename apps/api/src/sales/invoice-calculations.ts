import { BadRequestException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";

export function calculateInvoiceLine(input: {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxRatePercent: Prisma.Decimal;
  currency: string;
}) {
  const { quantity, unitPrice, discountAmount, taxRatePercent } = input;
  if (quantity.lte(0) || unitPrice.isNegative())
    throw new BadRequestException(
      "Invoice line quantity must be positive and price non-negative",
    );
  const precision = currencyPrecision(input.currency);
  const gross = quantity
    .mul(unitPrice)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  if (
    discountAmount.isNegative() ||
    discountAmount.gt(gross) ||
    discountAmount.decimalPlaces() > precision
  )
    throw new BadRequestException(
      "Line discount must be non-negative, within currency precision, and no greater than the line amount",
    );
  if (taxRatePercent.isNegative() || taxRatePercent.gt(100))
    throw new BadRequestException("Tax rate must be between 0 and 100 percent");
  const lineSubtotal = gross.minus(discountAmount);
  const taxAmount = lineSubtotal
    .mul(taxRatePercent)
    .div(100)
    .toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP);
  const lineTotal = lineSubtotal
    .plus(taxAmount)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  return {
    gross,
    discount: discountAmount,
    lineSubtotal,
    tax: taxAmount,
    total: lineTotal,
    currencyPrecision: precision,
  };
}

export function currencyPrecision(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    throw new BadRequestException(
      "Invoice currency is not a valid ISO currency code",
    );
  }
}
