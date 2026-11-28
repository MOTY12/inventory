import type { ReactNode } from "react";

export type DataTableColumn<Row> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
};

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription = "Try changing your search or filters.",
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <div
      className="ui-table-scroll"
      role="region"
      aria-label="Results"
      tabIndex={0}
    >
      <table className="ui-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`ui-align-${column.align ?? "left"}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                className="ui-table-message"
                colSpan={columns.length}
                role="status"
              >
                Loading records…
              </td>
            </tr>
          ) : rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`ui-align-${column.align ?? "left"}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="ui-table-message" colSpan={columns.length}>
                <strong>{emptyTitle}</strong>
                <span>{emptyDescription}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
