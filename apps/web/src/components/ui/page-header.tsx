import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-heading-copy">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? (
          <p className="ui-page-description">{description}</p>
        ) : null}
      </div>
      {action ? <div className="ui-page-actions">{action}</div> : null}
    </header>
  );
}
