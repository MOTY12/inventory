export type CsvCell = {
  value: string | null | undefined;
  kind: "text" | "number";
};

const dangerousTextPrefix = /^[\s\u0000-\u001f\u007f-\u009f\uFEFF]*[=+\-@]/u;
const decimalValue = /^-?\d+(?:\.\d+)?$/;

export function csvText(value: string | null | undefined): CsvCell {
  return { value, kind: "text" };
}

export function csvNumber(
  value: string | number | bigint | null | undefined,
): CsvCell {
  return { value: value == null ? "" : String(value), kind: "number" };
}

export function serializeCsvRow(cells: CsvCell[]): string {
  return `${cells.map(serializeCell).join(",")}\r\n`;
}

function serializeCell(cell: CsvCell): string {
  const value = cell.value ?? "";
  if (cell.kind === "number") return decimalValue.test(value) ? value : "";
  const safe = dangerousTextPrefix.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
