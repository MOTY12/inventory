import type { ReactNode } from "react";
import Link from "next/link";

export function DocumentActions({
  cancelHref,
  onCancel,
  children,
  busy = false,
}: {
  cancelHref?: string;
  onCancel?: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <footer className="document-actions">
      {cancelHref ? (
        <Link className="button button-secondary" href={cancelHref}>
          Cancel
        </Link>
      ) : (
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      )}
      {children}
    </footer>
  );
}
