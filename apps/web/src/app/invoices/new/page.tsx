"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";

type OrderLine = {
  id: string;
  productName: string;
  sku: string;
  unitCode: string;
  orderedQuantity: string;
  unitPrice: string;
};
type Order = {
  id: string;
  number: string;
  currency: string;
  customer: { name: string };
  lines: OrderLine[];
};
type TaxRate = {
  id: string;
  name: string;
  code: string;
  rate: string;
  isActive: boolean;
};
const root = "/organizations/current/sales";
const SCALE6 = BigInt(1000000);

function scaled(value: string, places: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value || "0");
  if (!match) return BigInt(0);
  return (
    BigInt(match[1]) * BigInt(10) ** BigInt(places) +
    BigInt(((match[2] ?? "") + "0".repeat(places)).slice(0, places) || "0")
  );
}
function rounded(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / BigInt(2)) / denominator;
}
function fixed(value: bigint, places: number) {
  const unit = BigInt(10) ** BigInt(places);
  return `${value / unit}.${String(value % unit).padStart(places, "0")}`;
}
function currencyDigits(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { organization, authenticatedRequest } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [orderId, setOrderId] = useState("");
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [rateIds, setRateIds] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const [eligible, rates] = await Promise.all([
        authenticatedRequest<Order[]>(`${root}/invoices/eligible-orders`),
        authenticatedRequest<TaxRate[]>(`${root}/tax-rates`),
      ]);
      setOrders(eligible);
      const requestedOrderId = new URLSearchParams(window.location.search).get(
        "salesOrderId",
      );
      if (
        requestedOrderId &&
        eligible.some((item) => item.id === requestedOrderId)
      )
        setOrderId(requestedOrderId);
      setTaxRates(rates.filter((rate) => rate.isActive));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Invoice setup could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const order = orders.find((item) => item.id === orderId);
  const preview = useMemo(() => {
    if (!order) return null;
    const precision = currencyDigits(order.currency);
    return order.lines.reduce(
      (sum, line) => {
        const gross = rounded(
          scaled(line.orderedQuantity, 6) * scaled(line.unitPrice, 4),
          SCALE6,
        );
        const discount = scaled(discounts[line.id] ?? "0", 4);
        const net = gross > discount ? gross - discount : BigInt(0);
        const rate = taxRates.find((item) => item.id === rateIds[line.id]);
        const rateScaled = rate ? scaled(rate.rate, 6) : BigInt(0);
        const denominator = BigInt(10) ** BigInt(4 + 6 + 2 - precision);
        const taxMinor = rounded(net * rateScaled, denominator);
        const tax = taxMinor * BigInt(10) ** BigInt(4 - precision);
        return {
          subtotal: sum.subtotal + gross,
          discount: sum.discount + discount,
          tax: sum.tax + tax,
          total: sum.total + net + tax,
        };
      },
      {
        subtotal: BigInt(0),
        discount: BigInt(0),
        tax: BigInt(0),
        total: BigInt(0),
      },
    );
  }, [order, discounts, rateIds, taxRates]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const invoice = await authenticatedRequest<{ id: string }>(
        `${root}/invoices`,
        {
          salesOrderId: order.id,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          lines: order.lines.map((line) => ({
            salesOrderLineId: line.id,
            discountAmount: discounts[line.id] || "0",
            taxRateId: rateIds[line.id] || undefined,
          })),
        },
        "POST",
        { "Idempotency-Key": crypto.randomUUID() },
      );
      router.push(`/invoices/${invoice.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Draft invoice could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES · FINANCE</p>
          <h1>Create invoice</h1>
          <p>
            Build an immutable financial document from a confirmed sales order.
          </p>
        </div>
        <Link className="button button-secondary" href="/invoices">
          Back to invoices
        </Link>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="catalog-loading">
          Loading eligible orders and tax rates…
        </p>
      ) : orders.length === 0 ? (
        <section className="catalog-empty">
          <h2>No eligible sales orders</h2>
          <p>Confirm a sales order before creating its invoice.</p>
          <Link href="/sales-orders">View sales orders</Link>
        </section>
      ) : (
        <form className="form-card" onSubmit={create}>
          <label>
            Confirmed sales order
            <select
              required
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Select an order</option>
              {orders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.number} · {item.customer.name} · {item.currency}
                </option>
              ))}
            </select>
          </label>
          {order && (
            <>
              <div className="catalog-panel">
                <h2>Invoice lines</h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit price</th>
                        <th>Discount</th>
                        <th>Tax rate</th>
                        <th>Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line) => {
                        const precision = currencyDigits(order.currency);
                        const gross = rounded(
                          scaled(line.orderedQuantity, 6) *
                            scaled(line.unitPrice, 4),
                          SCALE6,
                        );
                        const discount = scaled(discounts[line.id] ?? "0", 4);
                        const net =
                          gross > discount ? gross - discount : BigInt(0);
                        const taxRate = taxRates.find(
                          (item) => item.id === rateIds[line.id],
                        );
                        const rate = taxRate
                          ? scaled(taxRate.rate, 6)
                          : BigInt(0);
                        const tax =
                          rounded(
                            net * rate,
                            BigInt(10) ** BigInt(4 + 6 + 2 - precision),
                          ) *
                          BigInt(10) ** BigInt(4 - precision);
                        return (
                          <tr key={line.id}>
                            <td>
                              <strong>{line.productName}</strong>
                              <small>{line.sku}</small>
                            </td>
                            <td>
                              {line.orderedQuantity} {line.unitCode}
                            </td>
                            <td>{line.unitPrice}</td>
                            <td>
                              <input
                                aria-label={`Discount for ${line.productName}`}
                                inputMode="decimal"
                                value={discounts[line.id] ?? "0"}
                                onChange={(event) =>
                                  setDiscounts((current) => ({
                                    ...current,
                                    [line.id]: event.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <select
                                aria-label={`Tax rate for ${line.productName}`}
                                value={rateIds[line.id] ?? ""}
                                onChange={(event) =>
                                  setRateIds((current) => ({
                                    ...current,
                                    [line.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">No tax</option>
                                {taxRates.map((tax) => (
                                  <option key={tax.id} value={tax.id}>
                                    {tax.name} · {tax.rate}%
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              {fixed(net + tax, 4)} {order.currency}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {preview && (
                  <div className="invoice-total-preview">
                    <p>
                      Subtotal{" "}
                      <strong>
                        {fixed(preview.subtotal, 4)} {order.currency}
                      </strong>
                    </p>
                    <p>
                      Discount{" "}
                      <strong>
                        {fixed(preview.discount, 4)} {order.currency}
                      </strong>
                    </p>
                    <p>
                      Tax{" "}
                      <strong>
                        {fixed(preview.tax, 4)} {order.currency}
                      </strong>
                    </p>
                    <p>
                      Total{" "}
                      <strong>
                        {fixed(preview.total, 4)} {order.currency}
                      </strong>
                    </p>
                    <small>
                      Preview uses exact decimal integer arithmetic; the API
                      recalculates and remains authoritative.
                    </small>
                  </div>
                )}
              </div>
              <div className="form-grid">
                <label>
                  Due date
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    maxLength={1000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
              <div className="form-actions">
                <button disabled={busy} className="button button-primary">
                  {busy ? "Saving…" : "Save draft invoice"}
                </button>
                <p>
                  Invoice numbers are assigned only when the draft is issued.
                </p>
              </div>
            </>
          )}
        </form>
      )}
    </main>
  );
}
