"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";

type Transfer = {
  id: string;
  number: string;
  status: string;
  note: string | null;
  sourceWarehouse: { name: string };
  destinationWarehouse: { name: string };
  lines: {
    id: string;
    requestedQuantity: string;
    product: { name: string; sku: string; baseUnit: { code: string } };
    dispatchLines: { quantity: string }[];
    receiptLines: { quantity: string }[];
  }[];
  receipts: {
    id: string;
    receivedAt: string;
    note: string | null;
    lines: { quantity: string; transferLineId: string }[];
  }[];
  statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    occurredAt: string;
  }[];
};
const api = "/organizations/current/inventory/transfers";
export default function TransferDetailPage() {
  const { transferId } = useParams<{ transferId: string }>();
  const { organization, authenticatedRequest } = useSession();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!organization) return;
    try {
      setTransfer(await authenticatedRequest<Transfer>(`${api}/${transferId}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer could not be loaded");
    }
  }, [authenticatedRequest, organization, transferId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <main className="page-content">
      <p>
        <Link href="/transfers">← Transfers</Link>
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {!transfer ? (
        <p>Loading transfer…</p>
      ) : (
        <>
          <header className="page-heading">
            <div>
              <p className="eyebrow">INVENTORY TRANSFER</p>
              <h1>{transfer.number}</h1>
              <p>
                {transfer.sourceWarehouse.name} →{" "}
                {transfer.destinationWarehouse.name}
              </p>
            </div>
            <span className="status-badge">
              {transfer.status.replaceAll("_", " ")}
            </span>
          </header>
          {transfer.note && <p className="panel">{transfer.note}</p>}
          <section className="panel">
            <h2>Transfer lines</h2>
            <div className="catalog-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Requested</th>
                    <th>Dispatched</th>
                    <th>Received</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {transfer.lines.map((line) => {
                    const dispatched = line.dispatchLines.reduce(
                      (sum, row) => sum + Number(row.quantity),
                      0,
                    );
                    const received = line.receiptLines.reduce(
                      (sum, row) => sum + Number(row.quantity),
                      0,
                    );
                    return (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.product.name}</strong>
                          <small>{line.product.sku}</small>
                        </td>
                        <td>
                          {line.requestedQuantity} {line.product.baseUnit.code}
                        </td>
                        <td>{dispatched}</td>
                        <td>{received}</td>
                        <td>{Math.max(0, dispatched - received)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>Receiving history</h2>
            {transfer.receipts.length ? (
              <ol>
                {transfer.receipts.map((receipt) => (
                  <li key={receipt.id}>
                    {new Date(receipt.receivedAt).toLocaleString()} —{" "}
                    {receipt.lines
                      .map((row) => `${row.quantity} units`)
                      .join(", ")}
                    {receipt.note ? ` — ${receipt.note}` : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No quantities have been received.</p>
            )}
          </section>
          <section className="panel">
            <h2>Status history</h2>
            <ol>
              {transfer.statusHistory.map((entry) => (
                <li key={entry.id}>
                  {new Date(entry.occurredAt).toLocaleString()} —{" "}
                  {entry.fromStatus
                    ? `${entry.fromStatus.replaceAll("_", " ")} → `
                    : ""}
                  {entry.toStatus.replaceAll("_", " ")}
                  {entry.note ? ` — ${entry.note}` : ""}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}
