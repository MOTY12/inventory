"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BarcodeScanner } from "../../../components/barcode/barcode-scanner";
import { DocumentHeader } from "../../../components/documents/document-header";
import { DocumentInformation } from "../../../components/documents/document-information";
import { DocumentActionPanel } from "../../../components/documents/document-action-panel";
import { DocumentActivity } from "../../../components/documents/document-activity";
import { DocumentSummary } from "../../../components/documents/document-summary";
import { DocumentLayout } from "../../../components/documents/document-layout";
import { useSession } from "../../../features/auth/session-provider";
import {
  addQuantities,
  divideQuantityExact,
  formatDecimal,
  isPositiveDecimal,
  isAtMostQuantity,
  matchesQuantityPrecision,
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
  product: { name: string; sku: string; baseUnitId: string };
  unit: { id: string; code: string; name: string; precision: number };
};
type Receipt = {
  id: string;
  receivedAt: string;
  note: string | null;
  receivedBy: { user: { email: string } };
  lines: {
    id: string;
    quantity: string;
    purchaseOrderLine: {
      product: { name: string; sku: string };
      unit: { code: string };
    };
    stockMovement: { id: string } | null;
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
  const organizationIdRef = useRef(organization?.id ?? "");
  useLayoutEffect(() => {
    organizationIdRef.current = organization?.id ?? "";
  }, [organization?.id]);
  const params = useParams<{ purchaseOrderId: string }>();
  const id = params.purchaseOrderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const quantitiesRef = useRef<Record<string, string>>({});
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
  const requestVersion = useRef(0);
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!id || !organization) {
      setOrder(null);
      quantitiesRef.current = {};
      setQuantities({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setOrder(null);
    quantitiesRef.current = {};
    setQuantities({});
    const requestedOrganizationId = organization.id;
    try {
      const [result, receipts] = await Promise.all([
        authenticatedRequest<Order>(`${base}/${id}`),
        authenticatedRequest<Receipt[]>(`${base}/${id}/receipts`),
      ]);
      if (
        version !== requestVersion.current ||
        organizationIdRef.current !== requestedOrganizationId
      )
        return;
      setOrder({ ...result, receipts });
    } catch (cause) {
      if (
        version !== requestVersion.current ||
        organizationIdRef.current !== requestedOrganizationId
      )
        return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the purchase order.",
      );
    } finally {
      if (
        version === requestVersion.current &&
        organizationIdRef.current === requestedOrganizationId
      )
        setLoading(false);
    }
  }, [authenticatedRequest, id, organization]);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function action(path: string, success: string) {
    const confirmation =
      path === "cancel"
        ? "Cancel this purchase order? Goods cannot be received after cancellation."
        : path === "submit"
          ? "Submit this order so goods can be received against it?"
          : null;
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }
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
    const enteredLines = order.lines.filter(
      (line) => (quantities[line.id] ?? "").trim() !== "",
    );
    if (!enteredLines.length) {
      setError("Enter at least one positive quantity to receive.");
      return;
    }
    if (
      enteredLines.some((line) => !isPositiveDecimal(quantities[line.id] ?? ""))
    ) {
      setError("Each entered receipt quantity must be a positive decimal.");
      return;
    }
    const lines = enteredLines.map((line) => ({
      purchaseOrderLineId: line.id,
      quantity: quantities[line.id],
    }));
    const exceedsRemaining = lines.some((entry) => {
      const line = order.lines.find(
        (candidate) => candidate.id === entry.purchaseOrderLineId,
      );
      return (
        !line ||
        !isAtMostQuantity(
          entry.quantity,
          subtractQuantity(line.orderedQuantity, line.receivedQuantity),
        )
      );
    });
    if (exceedsRemaining) {
      setError(
        "A receipt quantity cannot exceed the remaining order quantity.",
      );
      return;
    }
    if (
      !window.confirm(
        "Post this goods receipt? Received quantities update warehouse inventory and weighted average cost.",
      )
    )
      return;
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
      quantitiesRef.current = {};
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

  function updateReceiveQuantities(
    update: (current: Record<string, string>) => Record<string, string>,
  ) {
    const next = update(quantitiesRef.current);
    quantitiesRef.current = next;
    setQuantities(next);
  }

  async function addScannedReceipt(barcode: string) {
    if (!order || !["SUBMITTED", "PARTIALLY_RECEIVED"].includes(order.status)) {
      throw new Error("This purchase order is not open for receiving.");
    }
    const scannedOrganizationId = organization?.id;
    const scannedRequestVersion = requestVersion.current;
    const product = await authenticatedRequest<{
      id: string;
      name: string;
      sku: string;
      type: string;
      trackInventory: boolean;
      baseUnit: { id: string };
    }>(
      `/organizations/current/catalog/products/by-barcode?barcode=${encodeURIComponent(barcode)}`,
    );
    if (
      !scannedOrganizationId ||
      organizationIdRef.current !== scannedOrganizationId ||
      requestVersion.current !== scannedRequestVersion
    ) {
      throw new Error("Workspace or order changed; scan the barcode again.");
    }
    if (product.type !== "STOCKED" || !product.trackInventory)
      throw new Error("This barcode is not an active stocked product.");
    const matching = order.lines.filter(
      (line) => line.productId === product.id,
    );
    if (!matching.length)
      throw new Error(`${product.name} is not on this purchase order.`);
    const line =
      matching.find((candidate) => candidate.unitId === product.baseUnit.id) ??
      (matching.length === 1 ? matching[0] : null);
    if (!line)
      throw new Error(
        `${product.name} has multiple order units. Scan a base-unit line or enter the received unit manually.`,
      );
    const increment = divideQuantityExact(
      line.orderedQuantity,
      line.baseQuantity,
    );
    if (
      !increment ||
      !matchesQuantityPrecision(increment, line.unit.precision)
    ) {
      throw new Error(
        `One base unit cannot be represented in ${line.unit.code}; enter the received quantity manually.`,
      );
    }
    const nextQuantity = addQuantities(
      quantitiesRef.current[line.id] ?? "0",
      increment,
    );
    const remaining = subtractQuantity(
      line.orderedQuantity,
      line.receivedQuantity,
    );
    if (!isAtMostQuantity(nextQuantity, remaining))
      throw new Error(`${product.name} is already at its outstanding limit.`);
    updateReceiveQuantities((current) => ({
      ...current,
      [line.id]: nextQuantity,
    }));
    return {
      productName: product.name,
      sku: product.sku,
      quantity: nextQuantity,
      unitCode: line.unit.code,
      detail: `of ${remaining} outstanding; receipt not posted`,
    };
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
      <DocumentHeader
        eyebrow="PURCHASING · ORDER DETAIL"
        title="Purchase order"
        reference={loading ? undefined : order?.number}
        description="Review ordered quantities, receive deliveries, and inspect the receipt history."
        breadcrumbs={[
          { label: "Purchase orders", href: "/purchase-orders" },
          { label: order?.number ?? "Order detail" },
        ]}
        status={order?.status}
      />
      {notice && (
        <p className="catalog-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="catalog-error" role="alert">
          <span>{error}</span>
          <button
            className="catalog-text-button"
            onClick={() => void reload()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <p>Purchase orders belong to the active organization.</p>
          <Link href="/organizations" className="catalog-secondary-link">
            Manage organizations
          </Link>
        </section>
      ) : loading ? (
        <section className="catalog-panel">
          <p className="catalog-loading" role="status">
            Loading purchase order details…
          </p>
        </section>
      ) : !order ? (
        <section className="catalog-empty">
          <h2>Purchase order unavailable</h2>
          <Link href="/purchase-orders">Return to the order register</Link>
        </section>
      ) : (
        <>
          <DocumentLayout
            aside={
              <DocumentSummary
                rows={[
                  { label: "Currency", value: order.currency },
                  {
                    label: "Order date",
                    value: new Date(order.orderDate).toLocaleDateString(),
                  },
                  { label: "Items", value: order.lines.length },
                ]}
                total={{
                  label: "Order value",
                  value: `${order.currency} ${formatDecimal(order.subtotal)}`,
                }}
              />
            }
          >
            <DocumentInformation
              title="Supplier and destination"
              fields={[
                { label: "Supplier", value: order.supplier.name },
                { label: "Receiving warehouse", value: order.warehouse.name },
                {
                  label: "Expected delivery",
                  value: order.expectedDeliveryAt
                    ? new Date(order.expectedDeliveryAt).toLocaleDateString()
                    : "Not specified",
                },
                { label: "Status", value: order.status.replaceAll("_", " ") },
              ]}
            />
          </DocumentLayout>
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
          <section className="document-section">
            <div className="catalog-panel-heading">
              <div>
                <span className="catalog-eyebrow">ORDER LINES</span>
                <h2>Outstanding quantities</h2>
              </div>
            </div>
            <div className="ui-table-scroll document-line-table">
              <table className="ui-data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Unit</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Remaining</th>
                    <th>Unit cost</th>
                    <th>Line total</th>
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
                        <td>{line.product.name}</td>
                        <td>{line.product.sku}</td>
                        <td>{line.unit.code}</td>
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
                          {order.currency} {formatDecimal(line.lineTotal)}
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
                                updateReceiveQuantities((old) => ({
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
                <DocumentActionPanel
                  title="Receive goods"
                  description="Post a partial or full receipt to update warehouse stock and weighted average cost."
                  busy={busy}
                >
                  <button
                    className="catalog-secondary-link"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      updateReceiveQuantities(() =>
                        Object.fromEntries(
                          order.lines
                            .filter((line) =>
                              isPositiveDecimal(
                                subtractQuantity(
                                  line.orderedQuantity,
                                  line.receivedQuantity,
                                ),
                              ),
                            )
                            .map((line) => [
                              line.id,
                              subtractQuantity(
                                line.orderedQuantity,
                                line.receivedQuantity,
                              ),
                            ]),
                        ),
                      )
                    }
                  >
                    Fill all outstanding quantities
                  </button>
                  <BarcodeScanner
                    label="Scan items on this purchase order"
                    buttonLabel="Add received item"
                    onScan={addScannedReceipt}
                  />
                  <button
                    className="primary-button"
                    type="button"
                    disabled={
                      busy || !Object.values(quantities).some(isPositiveDecimal)
                    }
                    onClick={() => void receive()}
                  >
                    {busy ? "Posting…" : "Post goods receipt"}
                  </button>
                </DocumentActionPanel>
              )}
          </section>
          <DocumentActivity
            title="Receiving history"
            entries={order.receipts.map((receipt) => ({
              id: receipt.id,
              title: `Goods received by ${receipt.receivedBy.user.email}`,
              occurredAt: receipt.receivedAt,
              description: `${receipt.lines.map((line) => `${line.purchaseOrderLine.product.name} ${line.quantity} ${line.purchaseOrderLine.unit.code}`).join(" · ")}${receipt.note ? ` · ${receipt.note}` : ""}${receipt.lines.some((line) => line.stockMovement) ? " · Stock movements posted" : ""}`,
            }))}
            emptyMessage="No goods have been received against this order."
          />
        </>
      )}
    </main>
  );
}
