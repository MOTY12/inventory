"use client";

import { useRef, useState } from "react";

type BarcodeScannerProps = {
  onScan: (barcode: string) => Promise<void>;
};

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  async function submit() {
    const value = barcode.trim();
    if (!value || busy) return;
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    try {
      await onScan(value);
      setBarcode("");
      setMessage(`Scanned ${value}`);
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Barcode could not be matched.",
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="barcode-scanner">
      <label htmlFor="order-barcode">Scan a product barcode</label>
      <div className="barcode-scanner-controls">
        <input
          ref={inputRef}
          id="order-barcode"
          autoComplete="off"
          inputMode="text"
          value={barcode}
          placeholder="Scan or enter barcode, then press Enter"
          onChange={(event) => setBarcode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button
          className="button button-secondary"
          type="button"
          disabled={busy || !barcode.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Looking up…" : "Add scanned product"}
        </button>
      </div>
      <p
        className={messageIsError ? "barcode-error" : "barcode-status"}
        role="status"
      >
        {message ||
          "Keyboard barcode scanners work when this field is focused."}
      </p>
    </div>
  );
}
