import { BadRequestException } from "@nestjs/common";

const MAX_ROWS = 5000;
const MAX_FIELD_LENGTH = 10_000;

export type CsvDocument = { headers: string[]; rows: string[][] };

export function parseCsv(source: string): CsvDocument {
  const text = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (fieldStarted || field.length) {
        throw new BadRequestException(
          "Malformed CSV: quote inside an unquoted field",
        );
      }
      quoted = true;
      fieldStarted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
      fieldStarted = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      if (records.length > MAX_ROWS + 1)
        throw new BadRequestException(
          `CSV files may contain at most ${MAX_ROWS} data rows`,
        );
      record = [];
      field = "";
      fieldStarted = false;
    } else {
      field += char;
      fieldStarted = true;
    }
    if (field.length > MAX_FIELD_LENGTH)
      throw new BadRequestException("CSV contains a field that is too long");
  }

  if (quoted)
    throw new BadRequestException("Malformed CSV: unclosed quoted field");
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push(record);
  if (records.length < 2)
    throw new BadRequestException(
      "CSV must contain a header and at least one data row",
    );
  if (records.length - 1 > MAX_ROWS)
    throw new BadRequestException(
      `CSV files may contain at most ${MAX_ROWS} data rows`,
    );

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => !header))
    throw new BadRequestException("CSV column names must not be blank");
  const normalized = headers.map((header) => header.toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== headers.length)
    throw new BadRequestException("CSV column names must be unique");
  return { headers, rows: records.slice(1) };
}
