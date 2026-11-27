export type DocumentActivityEntry = {
  id: string;
  title: string;
  occurredAt: string;
  description?: string | null;
};

export function DocumentActivity({
  title = "Activity",
  entries,
  emptyMessage = "No activity has been recorded.",
}: {
  title?: string;
  entries: DocumentActivityEntry[];
  emptyMessage?: string;
}) {
  return (
    <section className="document-section" aria-label={title}>
      <header className="document-section-heading">
        <h2>{title}</h2>
      </header>
      {entries.length ? (
        <ol className="document-activity">
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.title}</strong>
              <time dateTime={entry.occurredAt}>
                {new Date(entry.occurredAt).toLocaleString()}
              </time>
              {entry.description ? <p>{entry.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="panel-message">{emptyMessage}</p>
      )}
    </section>
  );
}
