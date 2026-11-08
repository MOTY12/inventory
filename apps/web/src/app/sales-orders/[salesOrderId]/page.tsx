"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";

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
    productName: string;
    sku: string;
    unitCode: string;
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
  const [order, setOrder] = useState<Order | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [pickQuantities, setPickQuantities] = useState<Record<string, string>>(
    {},
  );
  const [fulfillmentQuantities, setFulfillmentQuantities] = useState<
    Record<string, string>
  >({});
  const fulfillmentKey = useRef("");
  const pickKey = useRef("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );
  const hasOutstandingPick =
    order?.lines.some(
      (line) =>
        quantityUnits(line.pickedQuantity) >
        quantityUnits(line.fulfilledQuantity),
    ) ?? false;
  const load = useCallback(async () => {
    if (!organization || !id) return;
    setLoading(true);
    try {
      const [result, events, posted, confirmedPicks] = await Promise.all([
        authenticatedRequest<Order>(`${endpoint}/${id}`),
        authenticatedRequest<Audit[]>(`${endpoint}/${id}/audit`),
        authenticatedRequest<Fulfillment[]>(`${endpoint}/${id}/fulfillments`),
        authenticatedRequest<Pick[]>(`${endpoint}/${id}/picks`),
      ]);
      setOrder(result);
      setAudit(events);
      setFulfillments(posted);
      setPicks(confirmedPicks);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sales order could not be loaded.",
      );
    } finally {
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
    const lines = Object.entries(fulfillmentQuantities)
      .filter(
        ([, quantity]) =>
          /^\d+(\.\d{1,6})?$/.test(quantity) &&
          quantityUnits(quantity) > BigInt(0),
      )
      .map(([salesOrderLineId, quantity]) => ({ salesOrderLineId, quantity }));
    if (!lines.length) {
      setError("Enter a quantity for at least one outstanding line.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    if (!fulfillmentKey.current)
      fulfillmentKey.current = `sales-fulfillment-${order.id}-${crypto.randomUUID()}`;
    try {
      await authenticatedRequest(
        `${endpoint}/${order.id}/fulfillments`,
        { lines },
        "POST",
        { "Idempotency-Key": fulfillmentKey.current },
      );
      fulfillmentKey.current = "";
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
    const lines = Object.entries(pickQuantities)
      .filter(
        ([, quantity]) =>
          /^\d+(\.\d{1,6})?$/.test(quantity) &&
          quantityUnits(quantity) > BigInt(0),
      )
      .map(([salesOrderLineId, quantity]) => ({ salesOrderLineId, quantity }));
    if (!lines.length) {
      setError("Enter a quantity to pick for at least one order line.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    if (!pickKey.current)
      pickKey.current = `sales-pick-${order.id}-${crypto.randomUUID()}`;
    try {
      await authenticatedRequest(
        `${endpoint}/${order.id}/picks`,
        { lines },
        "POST",
        { "Idempotency-Key": pickKey.current },
      );
      pickKey.current = "";
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

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES / ORDER DETAILS</p>
          <h1>{order?.number ?? "Sales order"}</h1>
          <p>Review order lines, reservation quantities, and status history.</p>
        </div>
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
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <section className="panel">
          <p>Loading order…</p>
        </section>
      ) : !order ? (
        <section className="panel">
          <p>Sales order not found or unavailable.</p>
        </section>
      ) : (
        <>
          <section className="metric-grid order-summary">
            <article className="metric-card">
              <span>Status</span>
              <strong>{order.status.replaceAll("_", " ")}</strong>
            </article>
            <article className="metric-card">
              <span>Customer</span>
              <strong>{order.customer.name}</strong>
              <small>
                {order.customer.email ??
                  order.customer.phone ??
                  "No contact details"}
              </small>
            </article>
            <article className="metric-card">
              <span>Warehouse</span>
              <strong>{order.warehouse.name}</strong>
            </article>
            <article className="metric-card">
              <span>Order total</span>
              <strong>
                {order.currency} {order.total}
              </strong>
              <small>
                Order date {new Date(order.orderDate).toLocaleDateString()}
              </small>
            </article>
          </section>
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
              <table className="data-table">
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
                                  min="0"
                                  step="any"
                                  type="number"
                                  value={pickQuantities[line.id] ?? ""}
                                  onChange={(event) =>
                                    setPickQuantities((current) => ({
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
                                  step="any"
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
              <div className="order-actions">
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
              </div>
            )}
          <div className="dashboard-columns order-history-columns">
            <section className="panel">
              <h2>Status history</h2>
              <ol className="timeline">
                {order.statusHistory.map((item, index) => (
                  <li key={`${item.toStatus}-${index}`}>
                    <strong>{item.toStatus.replaceAll("_", " ")}</strong>
                    <small>
                      {item.fromStatus
                        ? `From ${item.fromStatus.replaceAll("_", " ")} · `
                        : "Created · "}
                      {new Date(item.occurredAt).toLocaleString()}
                    </small>
                  </li>
                ))}
              </ol>
            </section>
            <section className="panel">
              <h2>Audit activity</h2>
              {audit.length ? (
                <ol className="timeline">
                  {audit.map((event, index) => (
                    <li key={`${event.action}-${index}`}>
                      <strong>{event.action.replaceAll("_", " ")}</strong>
                      <small>
                        {new Date(event.occurredAt).toLocaleString()}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="panel-message">No audit events recorded.</p>
              )}
            </section>
          </div>
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
