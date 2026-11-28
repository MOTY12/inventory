import type { ReactNode } from "react";

export type DocumentInformationField = {
  label: string;
  value: ReactNode;
};

export function DocumentInformation({
  title = "Document information",
  fields,
}: {
  title?: string;
  fields: DocumentInformationField[];
}) {
  return (
    <section className="document-section" aria-label={title}>
      <header className="document-section-heading">
        <h2>{title}</h2>
      </header>
      <dl className="document-information">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
