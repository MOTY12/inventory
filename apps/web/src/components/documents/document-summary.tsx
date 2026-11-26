import type { ReactNode } from "react";

export type SummaryRow = { label: string; value: ReactNode };

export function DocumentSummary({
  rows,
  total,
  totalLabel = "Total",
}: {
  rows: SummaryRow[];
  total: SummaryRow;
  totalLabel?: string;
}) {
  return (
    <section className="document-summary" aria-label="Document summary">
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="document-summary-total">
        <span>{totalLabel}</span>
        <strong>{total.value}</strong>
      </div>
    </section>
  );
}
