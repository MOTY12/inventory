"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";
import { DocumentHeader } from "../../../components/documents/document-header";
import { DocumentInformation } from "../../../components/documents/document-information";
import { DocumentActionPanel } from "../../../components/documents/document-action-panel";
import { DocumentActivity } from "../../../components/documents/document-activity";
import { DocumentDetailTable } from "../../../components/documents/document-detail-table";
import {
  addQuantities,
  isAtMostQuantity,
  isPositiveDecimal,
  subtractQuantity,
} from "../../../features/procurement/decimal";

type TransferLine = {
  id: string;
  requestedQuantity: string;
  product: { name: string; sku: string; baseUnit: { code: string } };
  dispatchLines: { quantity: string; movementId: string }[];
  receiptLines: { quantity: string; movementId: string }[];
};
type Transfer = {
  id: string;
  number: string;
  status: string;
  note: string | null;
  createdAt: string;
  sourceWarehouse: { name: string };
  destinationWarehouse: { name: string };
  lines: TransferLine[];
  dispatch: {
    dispatchedAt: string;
    dispatchedBy: { user: { email: string } };
  } | null;
  receipts: {
    id: string;
    receivedAt: string;
    note: string | null;
    receivedBy: { user: { email: string } };
    lines: { quantity: string; transferLineId: string; movementId: string }[];
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
  const organizationIdRef = useRef(organization?.id ?? "");
  useLayoutEffect(() => {
    organizationIdRef.current = organization?.id ?? "";
  }, [organization?.id]);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [receiptNote, setReceiptNote] = useState("");
  const quantitiesRef = useRef<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [receiptAttempt, setReceiptAttempt] = useState<{
    signature: string;
    key: string;
  } | null>(null);
  const version = useRef(0);
  const canWrite = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "BUYER",
    "WAREHOUSE_CLERK",
  ].includes(organization?.role ?? "");
  const setReceiptQuantities = (next: Record<string, string>) => {
    quantitiesRef.current = next;
    setQuantities(next);
  };
  const load = useCallback(async () => {
    const currentVersion = ++version.current;
    if (!organization || !transferId) {
      setTransfer(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setTransfer(null);
    setReceiptQuantities({});
    const requestedOrganizationId = organization.id;
    try {
      const result = await authenticatedRequest<Transfer>(
        `${api}/${transferId}`,
      );
      if (
        currentVersion === version.current &&
        organizationIdRef.current === requestedOrganizationId
      )
        setTransfer(result);
    } catch (cause) {
      if (
        currentVersion === version.current &&
        organizationIdRef.current === requestedOrganizationId
      )
        setError(
          cause instanceof Error
            ? cause.message
            : "Transfer could not be loaded",
        );
    } finally {
      if (
        currentVersion === version.current &&
        organizationIdRef.current === requestedOrganizationId
      )
        setLoading(false);
    }
  }, [authenticatedRequest, organization, transferId]);
  useEffect(() => {
    void Promise.resolve().then(load);
    return () => {
      version.current += 1;
    };
  }, [load]);

  async function runAction(action: "submit" | "cancel" | "dispatch") {
    const prompt =
      action === "submit"
        ? "Submit this transfer for dispatch?"
        : action === "dispatch"
          ? "Dispatch all requested quantities? This will post outbound stock movements and remove stock from the source warehouse."
          : "Cancel this transfer?";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers =
        action === "dispatch"
          ? { "Idempotency-Key": `transfer-dispatch-${transferId}` }
          : undefined;
      await authenticatedRequest(
        `${api}/${transferId}/${action}`,
        undefined,
        "POST",
        headers,
      );
      setNotice(
        action === "submit"
          ? "Transfer submitted."
          : action === "dispatch"
            ? "Transfer dispatched."
            : "Transfer cancelled.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The transfer action failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function receive() {
    if (!transfer) return;
    const lines = transfer.lines
      .map((line) => ({
        transferLineId: line.id,
        quantity: quantitiesRef.current[line.id] ?? "",
      }))
      .filter((line) => isPositiveDecimal(line.quantity));
    if (!lines.length) return;
    if (
      lines.some((line) => {
        const source = transfer.lines.find(
          (candidate) => candidate.id === line.transferLineId,
        )!;
        const dispatched = source.dispatchLines.reduce(
          (sum, item) => addQuantities(sum, item.quantity),
          "0",
        );
        const received = source.receiptLines.reduce(
          (sum, item) => addQuantities(sum, item.quantity),
          "0",
        );
        return !isAtMostQuantity(
          line.quantity,
          subtractQuantity(dispatched, received),
        );
      })
    ) {
      setError(
        "A receipt quantity exceeds the outstanding dispatched quantity.",
      );
      return;
    }
    const receiptPayload = { lines, note: receiptNote.trim() || undefined };
    const signature = JSON.stringify(receiptPayload);
    if (
      !window.confirm(
        "Post these received quantities? Destination stock balances and immutable receipt movements will be updated.",
      )
    )
      return;
    const attempt =
      receiptAttempt?.signature === signature
        ? receiptAttempt
        : {
            signature,
            key: `transfer-receipt-${transferId}-${crypto.randomUUID()}`,
          };
    setReceiptAttempt(attempt);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `${api}/${transferId}/receipts`,
        receiptPayload,
        "POST",
        { "Idempotency-Key": attempt.key },
      );
      setReceiptAttempt(null);
      setReceiptQuantities({});
      setReceiptNote("");
      setNotice("Receipt posted.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Receipt could not be posted",
      );
    } finally {
      setBusy(false);
    }
  }

  const dispatchedQuantity = (line: TransferLine) =>
    line.dispatchLines.reduce(
      (sum, item) => addQuantities(sum, item.quantity),
      "0",
    );
  const receivedQuantity = (line: TransferLine) =>
    line.receiptLines.reduce(
      (sum, item) => addQuantities(sum, item.quantity),
      "0",
    );
  const outstandingQuantity = (line: TransferLine) =>
    subtractQuantity(dispatchedQuantity(line), receivedQuantity(line));
  const activity = transfer
    ? [
        ...(transfer.dispatch
          ? [
              {
                id: `dispatch-${transfer.id}`,
                title: "Stock dispatched",
                occurredAt: transfer.dispatch.dispatchedAt,
                description: `Dispatched by ${transfer.dispatch.dispatchedBy.user.email}. Outbound stock movements were posted.`,
              },
            ]
          : []),
        ...transfer.receipts.map((receipt) => ({
          id: receipt.id,
          title: `Receipt posted by ${receipt.receivedBy.user.email}`,
          occurredAt: receipt.receivedAt,
          description: `${receipt.lines.map((line) => `${line.quantity} ${transfer.lines.find((candidate) => candidate.id === line.transferLineId)?.product.baseUnit.code ?? "units"}`).join(", ")}${receipt.note ? ` · ${receipt.note}` : ""}. Destination stock movements were posted.`,
        })),
        ...transfer.statusHistory.map((entry) => ({
          id: entry.id,
          title: `${entry.fromStatus ? `${entry.fromStatus.replaceAll("_", " ")} → ` : ""}${entry.toStatus.replaceAll("_", " ")}`,
          occurredAt: entry.occurredAt,
          description: entry.note,
        })),
      ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    : [];

  return (
    <main className="page-content">
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {notice}
        </p>
      )}
      {loading ? (
        <p>Loading transfer…</p>
      ) : !transfer ? (
        <p className="catalog-empty">Transfer unavailable.</p>
      ) : (
        <>
          <DocumentHeader
            eyebrow="INVENTORY TRANSFER"
            title="Transfer"
            reference={transfer.number}
            description={`${transfer.sourceWarehouse.name} → ${transfer.destinationWarehouse.name}`}
            breadcrumbs={[
              { label: "Transfers", href: "/transfers" },
              { label: transfer.number },
            ]}
            status={transfer.status}
          />
          <DocumentInformation
            fields={[
              {
                label: "Source warehouse",
                value: transfer.sourceWarehouse.name,
              },
              {
                label: "Destination warehouse",
                value: transfer.destinationWarehouse.name,
              },
              {
                label: "Created",
                value: new Date(transfer.createdAt).toLocaleString(),
              },
              { label: "Note", value: transfer.note },
            ]}
          />
          <DocumentDetailTable
            title="Transfer lines"
            description="Requested, dispatched, received, and outstanding quantities for each product."
            rows={transfer.lines}
            rowKey={(line) => line.id}
            columns={[
              {
                key: "product",
                header: "Product",
                render: (line) => (
                  <>
                    <strong>{line.product.name}</strong>
                    <small>{line.product.sku}</small>
                  </>
                ),
              },
              {
                key: "requested",
                header: "Requested",
                align: "right",
                render: (line) =>
                  `${line.requestedQuantity} ${line.product.baseUnit.code}`,
              },
              {
                key: "dispatched",
                header: "Dispatched",
                align: "right",
                render: (line) =>
                  `${dispatchedQuantity(line)} ${line.product.baseUnit.code}`,
              },
              {
                key: "received",
                header: "Received",
                align: "right",
                render: (line) =>
                  `${receivedQuantity(line)} ${line.product.baseUnit.code}`,
              },
              {
                key: "outstanding",
                header: "Outstanding",
                align: "right",
                render: (line) =>
                  `${outstandingQuantity(line)} ${line.product.baseUnit.code}`,
              },
            ]}
          />
          {canWrite && transfer.status === "DRAFT" && (
            <DocumentActionPanel
              title="Submit transfer"
              description="Submit the reviewed warehouse transfer so it can be dispatched."
              busy={busy}
            >
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void runAction("submit")}
              >
                Submit transfer
              </button>
              <button
                className="catalog-secondary-link"
                disabled={busy}
                onClick={() => void runAction("cancel")}
              >
                Cancel transfer
              </button>
            </DocumentActionPanel>
          )}
          {canWrite && transfer.status === "SUBMITTED" && (
            <DocumentActionPanel
              title="Dispatch transfer"
              description="Dispatch posts outbound stock movements for all requested quantities. The action is recorded once."
              busy={busy}
            >
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void runAction("dispatch")}
              >
                {busy ? "Dispatching…" : "Dispatch all quantities"}
              </button>
              <button
                className="catalog-secondary-link"
                disabled={busy}
                onClick={() => void runAction("cancel")}
              >
                Cancel transfer
              </button>
            </DocumentActionPanel>
          )}
          {canWrite &&
            ["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(transfer.status) && (
              <DocumentActionPanel
                title="Receive at destination"
                description="Enter the quantities physically received. Posting updates destination balances and creates immutable stock movements."
                busy={busy}
              >
                {transfer.lines.some((line) =>
                  isPositiveDecimal(outstandingQuantity(line)),
                ) && (
                  <button
                    className="catalog-secondary-link"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setReceiptQuantities(
                        Object.fromEntries(
                          transfer.lines
                            .filter((line) =>
                              isPositiveDecimal(outstandingQuantity(line)),
                            )
                            .map((line) => [
                              line.id,
                              outstandingQuantity(line),
                            ]),
                        ),
                      )
                    }
                  >
                    Fill all outstanding quantities
                  </button>
                )}
                <div className="ui-table-scroll">
                  <table className="ui-data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Outstanding</th>
                        <th>Receive now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfer.lines.map((line) => (
                        <tr key={line.id}>
                          <td>
                            {line.product.name}{" "}
                            <small>{line.product.sku}</small>
                          </td>
                          <td>
                            {outstandingQuantity(line)}{" "}
                            {line.product.baseUnit.code}
                          </td>
                          <td>
                            {isPositiveDecimal(outstandingQuantity(line)) ? (
                              <input
                                aria-label={`Receive ${line.product.name}`}
                                type="number"
                                min="0"
                                max={outstandingQuantity(line)}
                                step="0.000001"
                                value={quantities[line.id] ?? ""}
                                onChange={(event) =>
                                  setReceiptQuantities({
                                    ...quantities,
                                    [line.id]: event.target.value,
                                  })
                                }
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="document-form-field">
                  Receipt note{" "}
                  <input
                    aria-label="Receipt note"
                    value={receiptNote}
                    maxLength={500}
                    onChange={(event) => setReceiptNote(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  type="button"
                  disabled={
                    busy || !Object.values(quantities).some(isPositiveDecimal)
                  }
                  onClick={() => void receive()}
                >
                  {busy ? "Posting receipt…" : "Post receipt"}
                </button>
              </DocumentActionPanel>
            )}
          <DocumentActivity
            title="Transfer activity"
            entries={activity}
            emptyMessage="No dispatch or receipt activity has been recorded."
          />
        </>
      )}
    </main>
  );
}
