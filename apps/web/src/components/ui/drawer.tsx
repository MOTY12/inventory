"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Drawer({
  id,
  open,
  title,
  description,
  onClose,
  children,
}: {
  id?: string;
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
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
      id={id}
      aria-labelledby="ui-drawer-title"
      aria-describedby={description ? "ui-drawer-description" : undefined}
      className="ui-drawer"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="ui-drawer-layout">
        <header className="ui-drawer-header">
          <div>
            <span className="ui-dialog-kicker">Stockroom</span>
            <h2 id="ui-drawer-title">{title}</h2>
            {description ? (
              <p id="ui-drawer-description">{description}</p>
            ) : null}
          </div>
          <button
            className="ui-drawer-close"
            aria-label="Close form"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="ui-drawer-body">{children}</div>
      </div>
    </dialog>
  );
}
