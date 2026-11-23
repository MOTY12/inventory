import assert from "node:assert/strict";
import test from "node:test";
import {
  csvNumber,
  csvText,
  serializeCsvRow,
} from "../dist/reporting/report-csv.js";

test("CSV text escapes fields and neutralizes formula prefixes after whitespace", () => {
  assert.equal(
    serializeCsvRow([
      csvText('name, "quoted"\nline'),
      csvText(' \t=HYPERLINK("https://bad")'),
      csvText("+1+1"),
      csvText("@cmd"),
      csvText("-code"),
    ]),
    '"name, ""quoted""\nline","\' \t=HYPERLINK(""https://bad"")","\'+1+1","\'@cmd","\'-code"\r\n',
  );
});

test("CSV numeric cells preserve exact decimal values and negative amounts", () => {
  assert.equal(
    serializeCsvRow([
      csvNumber("1200.005000"),
      csvNumber("-0.25"),
      csvNumber("NGN 5"),
    ]),
    "1200.005000,-0.25,\r\n",
  );
});
