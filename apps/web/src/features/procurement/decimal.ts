const QUANTITY_SCALE = 6;
const MONEY_SCALE = 4;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const QUANTITY_FACTOR = TEN ** BigInt(QUANTITY_SCALE);

function scaled(value: string, scale: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return ZERO;
  const fraction = match[2] ?? "";
  const padded = fraction.padEnd(scale, "0").slice(0, scale);
  return BigInt(match[1]) * TEN ** BigInt(scale) + BigInt(padded || "0");
}

export function multiplyQuantityByUnitCost(
  quantity: string,
  unitCost: string,
): bigint {
  const product =
    scaled(quantity, QUANTITY_SCALE) * scaled(unitCost, MONEY_SCALE);
  const quotient = product / QUANTITY_FACTOR;
  const remainder = product % QUANTITY_FACTOR;
  return quotient + (remainder * TWO >= QUANTITY_FACTOR ? ONE : ZERO);
}

export function sumLineAmounts(
  lines: { quantity: string; unitCost: string }[],
): string {
  const total = lines.reduce(
    (sum, line) =>
      sum + multiplyQuantityByUnitCost(line.quantity, line.unitCost),
    ZERO,
  );
  return formatScaled(total, MONEY_SCALE);
}

export function subtractQuantity(left: string, right: string): string {
  const difference =
    scaled(left, QUANTITY_SCALE) - scaled(right, QUANTITY_SCALE);
  return formatScaled(difference > ZERO ? difference : ZERO, QUANTITY_SCALE);
}

export function isPositiveDecimal(value: string): boolean {
  return scaled(value, QUANTITY_SCALE) > ZERO;
}

export function formatDecimal(value: string, scale = MONEY_SCALE): string {
  return formatScaled(scaled(value, scale), scale);
}

function formatScaled(value: bigint, scale: number): string {
  const factor = TEN ** BigInt(scale);
  const integer = (value / factor)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (value % factor).toString().padStart(scale, "0");
  return `${integer}.${fraction}`;
}
