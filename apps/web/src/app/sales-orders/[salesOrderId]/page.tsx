"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { BarcodeScanner } from "../../../components/barcode/barcode-scanner";
import {
  addQuantities,
  divideQuantityExact,
  matchesQuantityPrecision,
  subtractQuantity,
} from "../../../features/procurement/decimal";
import { useSession } from "../../../features/auth/session-provider";
import { DocumentHeader } from "../../../components/documents/document-header";
import { DocumentInformation } from "../../../components/documents/document-information";
import { DocumentActionPanel } from "../../../components/documents/document-action-panel";
import { DocumentActivity } from "../../../components/documents/document-activity";
import { DocumentSummary } from "../../../components/documents/document-summary";
import { DocumentLayout } from "../../../components/documents/document-layout";

type Order = {
  id: string;
  number: string;
  status: string;
  orderDate: string;
  expectedFulfillmentAt: string | null;
  currency: string;
  subtotal: string;
  total: string;
  notes: string | null;
  customer: { name: string; email: string | null; phone: string | null };
  warehouse: { name: string };
  lines: {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    unitCode: string;
    unit: { precision: number };
    orderedQuantity: string;
    baseQuantity: string;
    unitPrice: string;
    lineTotal: string;
    pickedQuantity: string;
    fulfilledQuantity: string;
    product: { baseUnit: { code: string } };
    reservation: null | {
      quantity: string;
      fulfilledQuantity: string;
      releasedQuantity: string;
      status: string;
      history: { reason: string; quantityDelta: string; occurredAt: string }[];
    };
  }[];
  statusHistory: {
    fromStatus: string | null;
    toStatus: string;
    occurredAt: string;
  }[];
};
type Audit = {
  action: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};
type Fulfillment = {
  id: string;
  postedAt: string;
  note: string | null;
  postedBy: { user: { email: string } };
  lines: {
    id: string;
    quantity: string;
    salesOrderLine: { productName: string; sku: string; unitCode: string };
  }[];
};
type Pick = {
  id: string;
  pickedAt: string;
  note: string | null;
  pickedBy: { user: { email: string } };
  lines: {
    id: string;
    quantity: string;
    salesOrderLine: { productName: string; sku: string; unitCode: string };
  }[];
};
const endpoint = "/organizations/current/sales/orders";
function quantityUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole || "0") * BigInt(1_000_000) +
    BigInt((fraction + "000000").slice(0, 6))
  );
}
function quantityText(value: bigint) {
  const whole = value / BigInt(1_000_000);
  const fraction = String(value % BigInt(1_000_000))
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export default function SalesOrderDetailPage() {
  const params = useParams<{ salesOrderId: string }>();
  const id = params.salesOrderId;
  const { organization, authenticatedRequest } = useSession();
  const organizationIdRef = useRef(organization?.id ?? "");
  useLayoutEffect(() => {
    organizationIdRef.current = organization?.id ?? "";
  }, [organization?.id]);
  const [order, setOrder] = useState<Order | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [pickQuantities, setPickQuantities] = useState<Record<string, string>>(
    {},
  );
  const pickQuantitiesRef = useRef<Record<string, string>>({});
  const [fulfillmentQuantities, setFulfillmentQuantities] = useState<
    Record<string, string>
  >({});
  const fulfillmentKey = useRef<{ signature: string; key: string } | null>(
    null,
  );
  const pickKey = useRef<{ signature: string; key: string } | null>(null);
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );
  const canCreateInvoice = ["OWNER", "ADMIN", "FINANCE"].includes(
    organization?.role ?? "",
  );
  const hasOutstandingPick =
    order?.lines.some(
      (line) =>
        quantityUnits(line.pickedQuantity) >
        quantityUnits(line.fulfilledQuantity),
    ) ?? false;
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!organization || !id) {
      setOrder(null);
      pickQuantitiesRef.current = {};
      setPickQuantities({});
      setAudit([]);
      setFulfillments([]);
      setPicks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setOrder(null);
    pickQuantitiesRef.current = {};
    setPickQuantities({});
    const requestedOrganizationId = organization.id;
    try {
      const [result, events, posted, confirmedPicks] = await Promise.all([
        authenticatedRequest<Order>(`${endpoint}/${id}`),
        authenticatedRequest<Audit[]>(`${endpoint}/${id}/audit`),
        authenticatedRequest<Fulfillment[]>(`${endpoint}/${id}/fulfillments`),
        authenticatedRequest<Pick[]>(`${endpoint}/${id}/picks`),
      ]);
      if (
        version !== requestVersion.current ||
        organizationIdRef.current !== requestedOrganizationId
      )
        return;
      setOrder(result);
      setAudit(events);
      setFulfillments(posted);
      setPicks(confirmedPicks);
      setError("");
    } catch (cause) {
      if (
        version !== requestVersion.current ||
        organizationIdRef.current !== requestedOrganizationId
      )
        return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Sales order could not be loaded.",
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
    void Promise.resolve().then(load);
  }, [load]);

  async function transition(action: "confirm" | "cancel") {
    if (!order) return;
    if (
      action === "confirm" &&
      !window.confirm(
        "Confirm this order? All quantities will be reserved from warehouse availability.",
      )
    )
      return;
    if (
      action === "cancel" &&
      !window.confirm("Cancel this order and release any active reservations?")
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `${endpoint}/${order.id}/${action}`,
        undefined,
        "POST",
        { "Idempotency-Key": `sales-${action}-${order.id}` },
      );
      setNotice(
        action === "confirm"
          ? "Order confirmed and stock reserved."
          : "Order cancelled and remaining reservations released.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Order could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function fulfillSelected() {
    if (!order) return;
    const entered = Object.entries(fulfillmentQuantities).filter(
      ([, quantity]) => quantity.trim() !== "",
    );
    if (!entered.length) {
      setError("Enter a quantity for at least one outstanding line.");
      return;
    }
    if (
      entered.some(
        ([, quantity]) =>
          !/^\d+(\.\d{1,6})?$/.test(quantity) ||
          quantityUnits(quantity) <= BigInt(0),
      )
    ) {
      setError(
        "Each fulfillment quantity must be a positive decimal with up to six places.",
      );
      return;
    }
    if (
      entered.some(([lineId, quantity]) => {
        const line = order.lines.find((candidate) => candidate.id === lineId);
        return (
          !line ||
          quantityUnits(quantity) >
            quantityUnits(line.pickedQuantity) -
              quantityUnits(line.fulfilledQuantity)
        );
      })
    ) {
      setError(
        "A fulfillment quantity cannot exceed the picked quantity that is still unfulfilled.",
      );
      return;
    }
    const lines = entered.map(([salesOrderLineId, quantity]) => ({
      salesOrderLineId,
      quantity,
    }));
    if (
      !window.confirm(
        `Post fulfillment for ${lines.length} line${lines.length === 1 ? "" : "s"}? This will deduct stock and consume reservations.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const signature = JSON.stringify(
      [...lines].sort((a, b) =>
        a.salesOrderLineId.localeCompare(b.salesOrderLineId),
      ),
    );
    if (fulfillmentKey.current?.signature !== signature) {
      fulfillmentKey.current = {
        signature,
        key: `sales-fulfillment-${order.id}-${crypto.randomUUID()}`,
      };
    }
    try {
      await authenticatedRequest(
        `${endpoint}/${order.id}/fulfillments`,
        { lines },
        "POST",
        { "Idempotency-Key": fulfillmentKey.current.key },
      );
      fulfillmentKey.current = null;
      setFulfillmentQuantities({});
      setNotice(
        "Fulfillment posted; stock and reservations have been updated.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Fulfillment could not be posted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmPick() {
    if (!order) return;
    const entered = Object.entries(pickQuantities).filter(
      ([, quantity]) => quantity.trim() !== "",
    );
    if (!entered.length) {
      setError("Enter a quantity to pick for at least one order line.");
      return;
    }
    if (
      entered.some(
        ([, quantity]) =>
          !/^\d+(\.\d{1,6})?$/.test(quantity) ||
          quantityUnits(quantity) <= BigInt(0),
      )
    ) {
      setError(
        "Each pick quantity must be a positive decimal with up to six places.",
      );
      return;
    }
    if (
      entered.some(([lineId, quantity]) => {
        const line = order.lines.find((candidate) => candidate.id === lineId);
        return (
          !line ||
          quantityUnits(quantity) >
            quantityUnits(line.orderedQuantity) -
              quantityUnits(line.pickedQuantity)
        );
      })
    ) {
      setError(
        "A pick quantity cannot exceed the quantity that remains unpicked.",
      );
      return;
    }
    const lines = entered.map(([salesOrderLineId, quantity]) => ({
      salesOrderLineId,
      quantity,
    }));
    if (
      !window.confirm(
        `Confirm picking ${lines.length} order line${lines.length === 1 ? "" : "s"}? Picking records handled quantities without changing on-hand stock.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    const signature = JSON.stringify(
      [...lines].sort((a, b) =>
        a.salesOrderLineId.localeCompare(b.salesOrderLineId),
      ),
    );
    if (pickKey.current?.signature !== signature) {
      pickKey.current = {
        signature,
        key: `sales-pick-${order.id}-${crypto.randomUUID()}`,
      };
    }
    try {
      await authenticatedRequest(
        `${endpoint}/${order.id}/picks`,
        { lines },
        "POST",
        { "Idempotency-Key": pickKey.current.key },
      );
      pickKey.current = null;
      pickQuantitiesRef.current = {};
      setPickQuantities({});
      setNotice("Picked quantities confirmed and are ready for fulfillment.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Picking could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updatePickQuantities(
    update: (current: Record<string, string>) => Record<string, string>,
  ) {
    const next = update(pickQuantitiesRef.current);
    pickQuantitiesRef.current = next;
    setPickQuantities(next);
  }

  async function addScannedPick(barcode: string) {
    if (
      !order ||
      !["CONFIRMED", "PARTIALLY_FULFILLED"].includes(order.status)
    ) {
      throw new Error("This order is not open for picking.");
    }
    const scannedOrganizationId = organization?.id;
    const scannedRequestVersion = requestVersion.current;
    const product = await authenticatedRequest<{
      id: string;
      name: string;
      sku: string;
      type: string;
      trackInventory: boolean;
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
    const exactLine = order.lines.find(
      (candidate) => candidate.productId === product.id,
    );
    if (!exactLine)
      throw new Error(`${product.name} is not on this sales order.`);
    if (!exactLine.reservation || exactLine.reservation.status !== "ACTIVE")
      throw new Error(`${product.name} has no active stock reservation.`);
    const increment = divideQuantityExact(
      exactLine.orderedQuantity,
      exactLine.baseQuantity,
    );
    if (
      !increment ||
      !matchesQuantityPrecision(increment, exactLine.unit.precision)
    ) {
      throw new Error(
        `One base unit cannot be represented in ${exactLine.unitCode}; use a compatible order unit.`,
      );
    }
    const nextQuantity = addQuantities(
      pickQuantitiesRef.current[exactLine.id] ?? "0",
      increment,
    );
    const unpicked = subtractQuantity(
      exactLine.orderedQuantity,
      exactLine.pickedQuantity,
    );
    if (!matchesQuantityPrecision(nextQuantity, exactLine.unit.precision)) {
      throw new Error(
        `The scanned quantity exceeds the precision supported by ${exactLine.unitCode}.`,
      );
    }
    if (quantityUnits(nextQuantity) > quantityUnits(unpicked)) {
      throw new Error(`${product.name} is already at its unpicked limit.`);
    }
    updatePickQuantities((current) => ({
      ...current,
      [exactLine.id]: nextQuantity,
    }));
    return {
      productName: product.name,
      sku: product.sku,
      quantity: addQuantities(exactLine.pickedQuantity, nextQuantity),
      unitCode: exactLine.unitCode,
      detail: `of ${exactLine.orderedQuantity} picked or pending`,
    };
  }

  return (
    <main className="page-content">
      <DocumentHeader
        eyebrow="SALES · ORDER DETAILS"
        title="Sales order"
        reference={order?.number}
        description="Review order lines, reservation quantities, and status history."
        breadcrumbs={[
          { label: "Sales orders", href: "/sales-orders" },
          { label: order?.number ?? "Order detail" },
        ]}
        status={order?.status}
        action={
          <div className="dashboard-actions">
            <Link href="/sales-orders" className="button button-secondary">
              All sales orders
            </Link>
            {order?.status === "DRAFT" && canWrite && (
              <Link
                href={`/sales-orders/${order.id}/edit`}
                className="button button-secondary"
              >
                Edit draft
              </Link>
            )}
            {order &&
              canCreateInvoice &&
              ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED"].includes(
                order.status,
              ) && (
                <Link
                  className="button button-secondary"
                  href={`/invoices/new?salesOrderId=${encodeURIComponent(order.id)}`}
                >
                  Create invoice
                </Link>
              )}
            {order?.status === "DRAFT" && canWrite && (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void transition("confirm")}
              >
                Confirm and reserve
              </button>
            )}
            {["DRAFT", "CONFIRMED"].includes(order?.status ?? "") &&
              canWrite &&
              !hasOutstandingPick && (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void transition("cancel")}
                >
                  Cancel order
                </button>
              )}
          </div>
        }
      />
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="catalog-text-button"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <p>Sales orders belong to the active organization.</p>
          <Link href="/organizations" className="catalog-secondary-link">
            Manage organizations
          </Link>
        </section>
      ) : loading ? (
        <section className="panel">
          <p className="catalog-loading" role="status">
            Loading order…
          </p>
        </section>
      ) : !order ? (
        <section className="catalog-empty">
          <h2>Sales order unavailable</h2>
          <p>This order may not belong to the active workspace.</p>
          <Link href="/sales-orders" className="catalog-secondary-link">
            Return to sales orders
          </Link>
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
                  { label: "Lines", value: order.lines.length },
                ]}
                total={{
                  label: "Order total",
                  value: `${order.currency} ${order.total}`,
                }}
              />
            }
          >
            <DocumentInformation
              title="Customer and fulfillment"
              fields={[
                { label: "Customer", value: order.customer.name },
                {
                  label: "Customer contact",
                  value: order.customer.email ?? order.customer.phone,
                },
                { label: "Fulfillment warehouse", value: order.warehouse.name },
                {
                  label: "Expected fulfillment",
                  value: order.expectedFulfillmentAt
                    ? new Date(order.expectedFulfillmentAt).toLocaleDateString()
                    : "Not specified",
                },
                { label: "Status", value: order.status.replaceAll("_", " ") },
                { label: "Notes", value: order.notes },
              ]}
            />
          </DocumentLayout>
          {order.status === "DRAFT" && (
            <p className="info-banner">
              This is a draft. Stock is not reserved until the order is
              confirmed.
            </p>
          )}
          {order.status === "CONFIRMED" && (
            <p className="info-banner">
              Order confirmed. Pick items from the reserved stock before posting
              fulfillment; picking itself does not change on-hand inventory.
            </p>
          )}
          {["CONFIRMED", "PARTIALLY_FULFILLED"].includes(order.status) && (
            <p className="info-banner">
              Remaining quantities stay reserved until fulfilled or the order is
              cancelled.
            </p>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Order lines</h2>
                <p>
                  Picked quantity is cumulative; fulfilled quantity cannot
                  exceed it.
                </p>
              </div>
            </div>
            <div className="product-table-wrap">
              <table className="ui-data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Ordered</th>
                    <th>Reserved</th>
                    <th>Picked</th>
                    <th>Fulfilled</th>
                    <th>Outstanding</th>
                    <th>Price</th>
                    <th>Line total</th>
                    {canWrite &&
                      ["CONFIRMED", "PARTIALLY_FULFILLED"].includes(
                        order.status,
                      ) && <th>Pick now</th>}
                    {canWrite &&
                      ["CONFIRMED", "PARTIALLY_FULFILLED"].includes(
                        order.status,
                      ) && <th>Fulfill now</th>}
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const outstanding =
                      quantityUnits(line.orderedQuantity) -
                      quantityUnits(line.fulfilledQuantity);
                    const unpicked =
                      quantityUnits(line.orderedQuantity) -
                      quantityUnits(line.pickedQuantity);
                    const pickedNotFulfilled =
                      quantityUnits(line.pickedQuantity) -
                      quantityUnits(line.fulfilledQuantity);
                    const remaining = line.reservation
                      ? quantityUnits(line.reservation.quantity) -
                        quantityUnits(line.reservation.fulfilledQuantity) -
                        quantityUnits(line.reservation.releasedQuantity)
                      : BigInt(0);
                    return (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.productName}</strong>
                          <small>{line.sku}</small>
                        </td>
                        <td>
                          {line.orderedQuantity} {line.unitCode}
                        </td>
                        <td>
                          {quantityText(remaining)} {line.product.baseUnit.code}{" "}
                          {line.reservation && (
                            <small>{line.reservation.status}</small>
                          )}
                        </td>
                        <td>
                          {line.pickedQuantity} {line.unitCode}
                          <small>
                            {quantityText(pickedNotFulfilled)} ready to fulfill
                          </small>
                        </td>
                        <td>
                          {line.fulfilledQuantity} {line.unitCode}
                        </td>
                        <td>
                          {quantityText(outstanding)} {line.unitCode}
                        </td>
                        <td>
                          {order.currency} {line.unitPrice}
                        </td>
                        <td>
                          {order.currency} {line.lineTotal}
                        </td>
                        {canWrite &&
                          ["CONFIRMED", "PARTIALLY_FULFILLED"].includes(
                            order.status,
                          ) && (
                            <td>
                              {unpicked > BigInt(0) ? (
                                <input
                                  aria-label={`Pick ${line.productName}`}
                                  max={quantityText(unpicked)}
                                  min="0"
                                  step="0.000001"
                                  type="number"
                                  value={pickQuantities[line.id] ?? ""}
                                  onChange={(event) =>
                                    updatePickQuantities((current) => ({
                                      ...current,
                                      [line.id]: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                        {canWrite &&
                          ["CONFIRMED", "PARTIALLY_FULFILLED"].includes(
                            order.status,
                          ) && (
                            <td>
                              {pickedNotFulfilled > BigInt(0) ? (
                                <input
                                  aria-label={`Fulfill ${line.productName}`}
                                  max={quantityText(pickedNotFulfilled)}
                                  min="0"
                                  step="0.000001"
                                  type="number"
                                  value={fulfillmentQuantities[line.id] ?? ""}
                                  onChange={(event) =>
                                    setFulfillmentQuantities((current) => ({
                                      ...current,
                                      [line.id]: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th
                      colSpan={
                        canWrite &&
                        ["CONFIRMED", "PARTIALLY_FULFILLED"].includes(
                          order.status,
                        )
                          ? 9
                          : 7
                      }
                    >
                      Total
                    </th>
                    <th>
                      {order.currency} {order.total}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
            {order.notes && (
              <p className="panel-message">Notes: {order.notes}</p>
            )}
          </section>
          {canWrite &&
            ["CONFIRMED", "PARTIALLY_FULFILLED"].includes(order.status) && (
              <DocumentActionPanel
                title="Picking and fulfillment"
                description="Confirm what was picked from reserved stock, then post only the picked quantities to fulfill the order."
                busy={busy}
              >
                <BarcodeScanner
                  onScan={addScannedPick}
                  label="Scan products to add to this pick"
                  buttonLabel="Add to pick"
                />
                <p>
                  Step 1: confirm picked quantities from the active reservation.
                </p>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void confirmPick()}
                >
                  Confirm selected pick
                </button>
                <p>
                  Step 2: fulfillment can only post picked quantities. Posting
                  deducts stock and consumes the reservation atomically.
                </p>
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void fulfillSelected()}
                >
                  Post selected fulfillment
                </button>
              </DocumentActionPanel>
            )}
          <DocumentActivity
            title="Order activity"
            entries={[
              ...order.statusHistory.map((item, index) => ({
                id: `status-${index}`,
                title: `${item.fromStatus ? `${item.fromStatus.replaceAll("_", " ")} → ` : "Created · "}${item.toStatus.replaceAll("_", " ")}`,
                occurredAt: item.occurredAt,
              })),
              ...audit.map((event, index) => ({
                id: `audit-${index}`,
                title: event.action.replaceAll("_", " "),
                occurredAt: event.occurredAt,
              })),
              ...picks.map((pick) => ({
                id: `pick-${pick.id}`,
                title: `Picked by ${pick.pickedBy.user.email}`,
                occurredAt: pick.pickedAt,
                description: pick.lines
                  .map(
                    (line) =>
                      `${line.salesOrderLine.productName} ${line.quantity} ${line.salesOrderLine.unitCode}`,
                  )
                  .join(" · "),
              })),
              ...fulfillments.map((fulfillment) => ({
                id: `fulfillment-${fulfillment.id}`,
                title: `Fulfilled by ${fulfillment.postedBy.user.email}`,
                occurredAt: fulfillment.postedAt,
                description: `${fulfillment.lines.map((line) => `${line.salesOrderLine.productName} ${line.quantity} ${line.salesOrderLine.unitCode}`).join(" · ")}${fulfillment.note ? ` · ${fulfillment.note}` : ""}`,
              })),
            ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))}
            emptyMessage="No order activity has been recorded."
          />
          <section className="panel">
            <h2>Picking history</h2>
            {picks.length ? (
              <div className="receipt-list">
                {picks.map((pick) => (
                  <article className="receipt-card" key={pick.id}>
                    <div>
                      <strong>
                        {new Date(pick.pickedAt).toLocaleString()}
                      </strong>
                      <span>{pick.pickedBy.user.email}</span>
                    </div>
                    {pick.note && <p>{pick.note}</p>}
                    <ul>
                      {pick.lines.map((line) => (
                        <li key={line.id}>
                          {line.salesOrderLine.productName} · {line.quantity}{" "}
                          {line.salesOrderLine.unitCode}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-message">No picking operations recorded.</p>
            )}
          </section>
          <section className="panel">
            <h2>Fulfillment history</h2>
            {fulfillments.length ? (
              <div className="receipt-list">
                {fulfillments.map((fulfillment) => (
                  <article className="receipt-card" key={fulfillment.id}>
                    <div>
                      <strong>
                        {new Date(fulfillment.postedAt).toLocaleString()}
                      </strong>
                      <span>{fulfillment.postedBy.user.email}</span>
                    </div>
                    {fulfillment.note && <p>{fulfillment.note}</p>}
                    <ul>
                      {fulfillment.lines.map((line) => (
                        <li key={line.id}>
                          {line.salesOrderLine.productName} · {line.quantity}{" "}
                          {line.salesOrderLine.unitCode}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-message">No fulfillment has been posted.</p>
            )}
          </section>
          <section className="panel">
            <h2>Reservation activity</h2>
            {order.lines.some((line) => line.reservation) ? (
              <div className="product-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Change</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.flatMap((line) =>
                      (line.reservation?.history ?? []).map((entry, index) => (
                        <tr key={`${line.id}-${index}`}>
                          <td>{line.productName}</td>
                          <td>{entry.quantityDelta}</td>
                          <td>{entry.reason.replaceAll("_", " ")}</td>
                          <td>{new Date(entry.occurredAt).toLocaleString()}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="panel-message">
                No stock is reserved while this order is a draft.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
