import type { ReactNode } from "react";

export function DocumentLineItems({
  title = "Products and quantities",
  description,
  addLabel = "Add product",
  onAdd,
  children,
}: {
  title?: string;
  description?: string;
  addLabel?: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="document-line-items" aria-label={title}>
      <header className="document-section-heading document-line-items-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={onAdd}
        >
          {addLabel}
        </button>
      </header>
      <div className="ui-table-scroll document-line-table">
        <table className="ui-data-table">{children}</table>
      </div>
    </section>
  );
}
