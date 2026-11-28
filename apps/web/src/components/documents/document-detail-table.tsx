import type { ReactNode } from "react";

export type DocumentDetailColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

export function DocumentDetailTable<T>({
  title,
  description,
  columns,
  rows,
  rowKey,
  emptyMessage = "No line items recorded.",
}: {
  title: string;
  description?: string;
  columns: DocumentDetailColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}) {
  return (
    <section className="document-line-items" aria-label={title}>
      <header className="document-section-heading document-line-items-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <div className="ui-table-scroll document-line-table">
        <table className="ui-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={
                    column.align === "right" ? "is-numeric" : undefined
                  }
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={
                        column.align === "right" ? "is-numeric" : undefined
                      }
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  <span className="ui-table-empty">{emptyMessage}</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
