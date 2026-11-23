"use client";

import { FormEvent, useId, useRef, useState } from "react";

export type BarcodeScanFeedback = {
  productName: string;
  sku: string;
  quantity?: string;
  unitCode?: string;
  detail?: string;
};

type BarcodeScannerProps = {
  onScan: (barcode: string) => Promise<BarcodeScanFeedback | void>;
  label?: string;
  buttonLabel?: string;
};

export function BarcodeScanner({
  onScan,
  label = "Scan a product barcode",
  buttonLabel = "Add scanned product",
}: BarcodeScannerProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  async function processQueue() {
    if (processingRef.current) return;
    processingRef.current = true;
    setBusy(true);
    while (queueRef.current.length > 0) {
      const nextBarcode = queueRef.current.shift()!;
      setMessage(`Looking up ${nextBarcode}…`);
      setMessageIsError(false);
      try {
        const result = await onScan(nextBarcode);
        setMessage(
          result
            ? `${result.productName} · ${result.sku}${result.quantity ? ` · ${result.quantity}${result.unitCode ? ` ${result.unitCode}` : ""}` : ""}${result.detail ? ` · ${result.detail}` : ""}`
            : `Scanned ${nextBarcode}`,
        );
      } catch (cause) {
        setMessageIsError(true);
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Barcode could not be matched.",
        );
      }
    }
    processingRef.current = false;
    setBusy(false);
    inputRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("barcode") ?? "").trim();
    if (!value) return;
    setBarcode("");
    setMessageIsError(false);
    queueRef.current.push(value);
    void processQueue();
  }

  return (
    <section className="barcode-scanner" aria-busy={busy}>
      <label htmlFor={`${id}-barcode`}>{label}</label>
      <form className="barcode-scanner-controls" onSubmit={submit}>
        <div className="barcode-input-wrap">
          <svg
            className="barcode-scanner-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M4 5v14M7 5v14m3-14v14m4-14v14m3-14v14m3-14v14"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            id={`${id}-barcode`}
            name="barcode"
            autoComplete="off"
            inputMode="text"
            maxLength={100}
            value={barcode}
            placeholder="Scan or enter a barcode"
            aria-describedby={`${id}-status`}
            onChange={(event) => setBarcode(event.target.value)}
          />
        </div>
        <button
          className="button button-secondary"
          type="submit"
          disabled={!barcode.trim()}
        >
          {busy ? "Queue scan" : buttonLabel}
        </button>
      </form>
      <p
        id={`${id}-status`}
        className={messageIsError ? "barcode-error" : "barcode-status"}
        role={messageIsError ? "alert" : "status"}
        aria-live={messageIsError ? "assertive" : "polite"}
      >
        {message ||
          "Use a USB/Bluetooth keyboard scanner or type a barcode and press Enter."}
      </p>
    </section>
  );
}
