import type { ReactNode } from "react";

export function TableToolbar({
  query,
  onQueryChange,
  queryLabel,
  queryPlaceholder,
  children,
  onClear,
  clearLabel = "Clear filters",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  queryLabel: string;
  queryPlaceholder: string;
  children?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="ui-filter-toolbar">
      <label>
        {queryLabel}
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={queryPlaceholder}
        />
      </label>
      {children}
      {onClear ? (
        <button className="ui-quiet-button" onClick={onClear} type="button">
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}
