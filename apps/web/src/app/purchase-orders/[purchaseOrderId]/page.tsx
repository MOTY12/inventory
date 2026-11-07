"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";
import {
  formatDecimal,
  isPositiveDecimal,
  subtractQuantity,
} from "../../../features/procurement/decimal";

type Line = {
  id: string;
  productId: string;
  unitId: string;
  orderedQuantity: string;
  receivedQuantity: string;
  receivedBaseQuantity: string;
  baseQuantity: string;
  unitCost: string;
  lineTotal: string;
  product: { name: string; sku: string };
  unit: { code: string; name: string };
};
type Receipt = {
  id: string;
  receivedAt: string;
  note: string | null;
  lines: {
    id: string;
    quantity: string;
    purchaseOrderLine: {
      product: { name: string; sku: string };
      unit: { code: string };
    };
  }[];
};
type Order = {
  id: string;
  number: string;
  status: string;
  currency: string;
  subtotal: string;
  orderDate: string;
  expectedDeliveryAt: string | null;
  supplier: { id: string; name: string };
  warehouse: { id: string; name: string };
  lines: Line[];
  receipts: Receipt[];
};
const base = "/organizations/current/procurement/purchase-orders";

export default function PurchaseOrderDetailPage() {
  const { authenticatedRequest, organization } = useSession();
  const params = useParams<{ purchaseOrderId: string }>();
  const id = params.purchaseOrderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptKey, setReceiptKey] = useState<{
    signature: string;
    key: string;
  } | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftEdits, setDraftEdits] = useState<
    Record<string, { quantity: string; unitCost: string }>
  >({});
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setOrder(await authenticatedRequest<Order>(`${base}/${id}`));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the purchase order.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, id]);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function action(path: string, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(`${base}/${id}/${path}`, {}, "POST");
      setNotice(success);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function receive() {
    if (!order) return;
    const lines = order.lines
      .filter((line) => Number(quantities[line.id]) > 0)
      .map((line) => ({
        purchaseOrderLineId: line.id,
        quantity: quantities[line.id],
      }));
    if (!lines.length) {
      setError("Enter at least one positive quantity to receive.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const signature = JSON.stringify(
        [...lines].sort((a, b) =>
          a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId),
        ),
      );
      const key =
        receiptKey?.signature === signature
          ? receiptKey.key
          : crypto.randomUUID();
      setReceiptKey({ signature, key });
      await authenticatedRequest(`${base}/${id}/receipts`, { lines }, "POST", {
        "Idempotency-Key": key,
      });
      setReceiptKey(null);
      setQuantities({});
      setNotice("Goods received and inventory updated.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not post receipt.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!order) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `${base}/${id}`,
        {
          supplierId: order.supplier.id,
          warehouseId: order.warehouse.id,
          currency: order.currency,
          expectedDeliveryAt: order.expectedDeliveryAt?.slice(0, 10),
          lines: order.lines.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
            quantity: draftEdits[line.id]?.quantity ?? line.orderedQuantity,
            unitCost: draftEdits[line.id]?.unitCost ?? line.unitCost,
          })),
        },
        "PATCH",
      );
      setEditingDraft(false);
      setNotice("Draft purchase order updated.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="products-page">
      <header className="products-heading">
        <div>
          <Link href="/purchase-orders" className="catalog-back">
            ← Purchase orders
          </Link>
          <p className="catalog-eyebrow">PURCHASING · ORDER DETAIL</p>
          <h1>
            {loading ? "Loading order…" : (order?.number ?? "Purchase order")}
          </h1>
          <p>
            Review ordered quantities, receive deliveries, and inspect the
            receipt history.
          </p>
        </div>
      </header>
      {notice && (
        <p className="catalog-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="catalog-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <section className="catalog-panel">
          <p>Loading purchase order details…</p>
        </section>
      ) : !order ? (
        <section className="catalog-empty">
          <h2>Purchase order unavailable</h2>
          <Link href="/purchase-orders">Return to the order register</Link>
        </section>
      ) : (
        <>
          <section className="catalog-panel po-summary">
            <div>
              <span className="catalog-eyebrow">SUPPLIER</span>
              <strong>{order.supplier.name}</strong>
            </div>
            <div>
              <span className="catalog-eyebrow">DESTINATION</span>
              <strong>{order.warehouse.name}</strong>
            </div>
            <div>
              <span className="catalog-eyebrow">STATUS</span>
              <span className="status-pill">
                {order.status.replaceAll("_", " ")}
              </span>
            </div>
            <div>
              <span className="catalog-eyebrow">ORDER TOTAL</span>
              <strong>
                {order.currency} {formatDecimal(order.subtotal)}
              </strong>
            </div>
          </section>
          {canWrite && (
            <div className="po-actions">
              {order.status === "DRAFT" && !editingDraft && (
                <button
                  className="catalog-secondary-link"
                  disabled={busy}
                  onClick={() => {
                    setDraftEdits(
                      Object.fromEntries(
                        order.lines.map((line) => [
                          line.id,
                          {
                            quantity: line.orderedQuantity,
                            unitCost: line.unitCost,
                          },
                        ]),
                      ),
                    );
                    setEditingDraft(true);
                  }}
                >
                  Edit draft
                </button>
              )}
              {editingDraft && (
                <>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                  >
                    Save draft
                  </button>
                  <button
                    className="catalog-secondary-link"
                    disabled={busy}
                    onClick={() => setEditingDraft(false)}
                  >
                    Discard edits
                  </button>
                </>
              )}
              {order.status === "DRAFT" && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void action("submit", "Purchase order submitted.")
                  }
                >
                  Submit order
                </button>
              )}
              {["DRAFT", "SUBMITTED"].includes(order.status) && (
                <button
                  className="catalog-secondary-link"
                  disabled={busy}
                  onClick={() =>
                    void action("cancel", "Purchase order cancelled.")
                  }
                >
                  Cancel order
                </button>
              )}
            </div>
          )}
          <section className="catalog-panel">
            <div className="catalog-panel-heading">
              <div>
                <span className="catalog-eyebrow">ORDER LINES</span>
                <h2>Outstanding quantities</h2>
              </div>
            </div>
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Remaining</th>
                    <th>Unit cost</th>
                    <th>Receive now</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const remaining = subtractQuantity(
                      line.orderedQuantity,
                      line.receivedQuantity,
                    );
                    return (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.product.name}</strong>
                          <small>{line.product.sku}</small>
                        </td>
                        <td>
                          {editingDraft ? (
                            <input
                              aria-label={`Ordered quantity for ${line.product.name}`}
                              type="number"
                              min="0.000001"
                              step="0.000001"
                              value={
                                draftEdits[line.id]?.quantity ??
                                line.orderedQuantity
                              }
                              onChange={(event) =>
                                setDraftEdits((old) => ({
                                  ...old,
                                  [line.id]: {
                                    quantity: event.target.value,
                                    unitCost:
                                      old[line.id]?.unitCost ?? line.unitCost,
                                  },
                                }))
                              }
                            />
                          ) : (
                            <>
                              {line.orderedQuantity} {line.unit.code}
                            </>
                          )}
                        </td>
                        <td>
                          {line.receivedQuantity} {line.unit.code}
                        </td>
                        <td>
                          {remaining} {line.unit.code}
                        </td>
                        <td>
                          {editingDraft ? (
                            <input
                              aria-label={`Unit cost for ${line.product.name}`}
                              type="number"
                              min="0"
                              step="0.0001"
                              value={
                                draftEdits[line.id]?.unitCost ?? line.unitCost
                              }
                              onChange={(event) =>
                                setDraftEdits((old) => ({
                                  ...old,
                                  [line.id]: {
                                    quantity:
                                      old[line.id]?.quantity ??
                                      line.orderedQuantity,
                                    unitCost: event.target.value,
                                  },
                                }))
                              }
                            />
                          ) : (
                            <>
                              {order.currency} {formatDecimal(line.unitCost)}
                            </>
                          )}
                        </td>
                        <td>
                          {canWrite &&
                          ["SUBMITTED", "PARTIALLY_RECEIVED"].includes(
                            order.status,
                          ) &&
                          isPositiveDecimal(remaining) ? (
                            <input
                              aria-label={`Receive quantity for ${line.product.name}`}
                              type="number"
                              min="0"
                              max={remaining}
                              step="0.000001"
                              value={quantities[line.id] ?? ""}
                              onChange={(event) =>
                                setQuantities((old) => ({
                                  ...old,
                                  [line.id]: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canWrite &&
              ["SUBMITTED", "PARTIALLY_RECEIVED"].includes(order.status) && (
                <div className="po-receive-action">
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void receive()}
                  >
                    {busy ? "Posting…" : "Post goods receipt"}
                  </button>
                  <p>
                    Receipt posting updates stock balances and weighted average
                    cost.
                  </p>
                </div>
              )}
          </section>
          <section className="catalog-panel">
            <div className="catalog-panel-heading">
              <div>
                <span className="catalog-eyebrow">RECEIVING HISTORY</span>
                <h2>Posted receipts</h2>
              </div>
            </div>
            {order.receipts.length ? (
              <div className="receipt-list">
                {order.receipts.map((receipt) => (
                  <article className="receipt-card" key={receipt.id}>
                    <div>
                      <strong>
                        {new Date(receipt.receivedAt).toLocaleString()}
                      </strong>
                      <span>{receipt.note || "Posted receipt"}</span>
                    </div>
                    <ul>
                      {receipt.lines.map((line) => (
                        <li key={line.id}>
                          {line.purchaseOrderLine.product.name} ·{" "}
                          {line.quantity} {line.purchaseOrderLine.unit.code}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : (
              <div className="catalog-empty">
                <h3>No goods received yet</h3>
                <p>Receipts will be recorded here when posted.</p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
