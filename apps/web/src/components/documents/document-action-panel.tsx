import type { ReactNode } from "react";

export function DocumentActionPanel({
  title,
  description,
  busy = false,
  children,
}: {
  title: string;
  description: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="document-action-panel"
      aria-label={title}
      aria-busy={busy}
    >
      <header className="document-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
