"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby="ui-confirm-title"
      aria-describedby="ui-confirm-description"
      className="ui-confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        if (open && !busy) onCancel();
      }}
      ref={dialogRef}
    >
      <div className="ui-confirm-content">
        <span className="ui-dialog-kicker">Please confirm</span>
        <h2 id="ui-confirm-title">{title}</h2>
        <p id="ui-confirm-description">{description}</p>
        <div className="ui-dialog-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button ui-confirm-danger"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
