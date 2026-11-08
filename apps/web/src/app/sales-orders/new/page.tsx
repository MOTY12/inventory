"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";

type Option = { id: string; name: string };
type UnitOption = {
  id: string;
  code: string;
  name: string;
  precision?: number;
  baseQuantity?: string;
};
type Product = {
  id: string;
  name: string;
  sku: string;
  defaultSalePrice: string | null;
  saleCurrency: string | null;
  baseUnit: UnitOption;
  unitConversions: UnitOption[];
};
type Balance = { productId: string; onHand: string; reserved: string };
type Line = {
  productId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};
const salesApi = "/organizations/current/sales/orders";

function scaled(value: string, places: number) {
  if (!/^\d+(\.\d*)?$/.test(value)) return BigInt(0);
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(places) +
    BigInt((fraction + "0".repeat(places)).slice(0, places))
  );
}
function display(value: bigint, places: number) {
  const scale = BigInt(10) ** BigInt(places);
  const whole = value / scale;
  const fraction = String(value % scale)
    .padStart(places, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
function lineTotal(line: Line) {
  const unrounded = scaled(line.quantity, 6) * scaled(line.unitPrice, 4);
  return (unrounded + BigInt(500_000)) / BigInt(1_000_000);
}

export default function NewSalesOrderPage() {
  const router = useRouter();
  const { organization, authenticatedRequest } = useSession();
  const [customers, setCustomers] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expectedFulfillmentAt, setExpectedFulfillmentAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { productId: "", unitId: "", quantity: "1", unitPrice: "0" },
  ]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const key = useRef(`sales-order-create-${crypto.randomUUID()}`);

  useEffect(() => {
    if (!organization) return;
    void (async () => {
      setLoading(true);
      try {
        const [c, w, p] = await Promise.all([
          authenticatedRequest<{ data: Option[] }>(
            "/organizations/current/sales/customers?page=1&page_size=100&status=ACTIVE",
          ),
          authenticatedRequest<{ data: Option[] }>(
            "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
          ),
          authenticatedRequest<{ data: Product[] }>(
            "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
          ),
        ]);
        setCustomers(c.data);
        setWarehouses(w.data);
        setProducts(p.data);
        setCustomerId(c.data[0]?.id ?? "");
        setWarehouseId(w.data[0]?.id ?? "");
        setLines([
          {
            productId: p.data[0]?.id ?? "",
            unitId: p.data[0]?.baseUnit.id ?? "",
            quantity: "1",
            unitPrice: p.data[0]?.defaultSalePrice ?? "0",
          },
        ]);
        if (p.data[0]?.saleCurrency) setCurrency(p.data[0].saleCurrency);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Order options could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [authenticatedRequest, organization]);

  const loadBalances = useCallback(async () => {
    if (!warehouseId) return;
    setAvailabilityError("");
    try {
      const result = await authenticatedRequest<{ data: Balance[] }>(
        `/inventory/warehouses/${warehouseId}/balances?page=1&page_size=100`,
      );
      setBalances(
        Object.fromEntries(
          result.data.map((balance) => [balance.productId, balance]),
        ),
      );
    } catch (cause) {
      setBalances({});
      setAvailabilityError(
        cause instanceof Error
          ? cause.message
          : "Availability could not be loaded.",
      );
    }
  }, [authenticatedRequest, warehouseId]);
  useEffect(() => {
    void Promise.resolve().then(loadBalances);
  }, [loadBalances]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), BigInt(0)),
    [lines],
  );
  function updateLine(index: number, changes: Partial<Line>) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...changes };
        if (changes.productId) {
          const product = products.find((row) => row.id === changes.productId);
          next.unitId = product?.baseUnit.id ?? "";
          next.unitPrice = product?.defaultSalePrice ?? "0";
          if (product?.saleCurrency) setCurrency(product.saleCurrency);
        }
        return next;
      }),
    );
  }
  function availability(line: Line) {
    const balance = balances[line.productId];
    if (!balance) return "0";
    return display(scaled(balance.onHand, 6) - scaled(balance.reserved, 6), 6);
  }
  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await authenticatedRequest<{ id: string }>(
        salesApi,
        {
          customerId,
          warehouseId,
          currency,
          orderDate,
          expectedFulfillmentAt: expectedFulfillmentAt || undefined,
          notes: notes || undefined,
          lines: lines.map(({ productId, unitId, quantity, unitPrice }) => ({
            productId,
            unitId: unitId || undefined,
            quantity,
            unitPrice,
          })),
        },
        "POST",
        { "Idempotency-Key": key.current },
      );
      router.push(`/sales-orders/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES / NEW ORDER</p>
          <h1>Create sales order</h1>
          <p>Save a draft first. Stock is reserved only when you confirm it.</p>
        </div>
        <Link className="button button-secondary" href="/sales-orders">
          Back to orders
        </Link>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {availabilityError && (
        <p className="error-banner" role="alert">
          {availabilityError}
        </p>
      )}
      {loading ? (
        <section className="panel">
          <p>Loading customers, warehouses and products…</p>
        </section>
      ) : !canWrite ? (
        <section className="panel">
          <p>Your role can view sales orders but cannot create them.</p>
        </section>
      ) : (
        <form className="panel order-editor" onSubmit={saveDraft}>
          <section>
            <h2>Customer and order details</h2>
            <div className="form-grid">
              <label>
                Customer
                <select
                  required
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Warehouse
                <select
                  required
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Order date
                <input
                  required
                  type="date"
                  value={orderDate}
                  onChange={(event) => setOrderDate(event.target.value)}
                />
              </label>
              <label>
                Expected fulfillment
                <input
                  type="date"
                  value={expectedFulfillmentAt}
                  onChange={(event) =>
                    setExpectedFulfillmentAt(event.target.value)
                  }
                />
              </label>
              <label>
                Currency
                <input
                  required
                  maxLength={3}
                  pattern="[A-Z]{3}"
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                Notes
                <input
                  maxLength={1000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
          </section>
          <section>
            <div className="panel-heading">
              <div>
                <h2>Products</h2>
                <p>
                  Availability is live for the selected warehouse. Confirmation
                  reserves the base-unit quantity.
                </p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      productId: "",
                      unitId: "",
                      quantity: "1",
                      unitPrice: "0",
                    },
                  ])
                }
              >
                Add line
              </button>
            </div>
            <div className="product-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Available</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Line total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const product = products.find(
                      (row) => row.id === line.productId,
                    );
                    const units = product
                      ? [product.baseUnit, ...product.unitConversions]
                      : [];
                    return (
                      <tr key={index}>
                        <td>
                          <select
                            required
                            aria-label="Product"
                            value={line.productId}
                            onChange={(event) =>
                              updateLine(index, {
                                productId: event.target.value,
                              })
                            }
                          >
                            <option value="">Choose product</option>
                            {products.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} · {item.sku}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label="Unit"
                            value={line.unitId}
                            onChange={(event) =>
                              updateLine(index, { unitId: event.target.value })
                            }
                          >
                            {units.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {availability(line)} {product?.baseUnit.code}
                        </td>
                        <td>
                          <input
                            aria-label="Quantity"
                            required
                            min="0.000001"
                            step="any"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(index, {
                                quantity: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label="Unit price"
                            required
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(event) =>
                              updateLine(index, {
                                unitPrice: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          {currency} {display(lineTotal(line), 4)}
                        </td>
                        <td>
                          <button
                            className="button button-secondary"
                            type="button"
                            aria-label="Remove product"
                            disabled={lines.length === 1}
                            onClick={() =>
                              setLines((current) =>
                                current.filter(
                                  (_, lineIndex) => lineIndex !== index,
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {customers.length === 0 && (
              <p className="panel-message">
                Create a customer before starting an order.
              </p>
            )}
            {warehouses.length === 0 && (
              <p className="panel-message">
                Create or grant access to a warehouse before starting an order.
              </p>
            )}
            {products.length === 0 && (
              <p className="panel-message">
                Add an active stocked product before starting an order.
              </p>
            )}
            <div className="order-total">
              <span>Subtotal / total</span>
              <strong>
                {currency} {display(subtotal, 4)}
              </strong>
            </div>
          </section>
          <footer className="order-actions">
            <p>
              Drafts do not reserve stock. Confirming this order will reserve
              all listed quantities atomically.
            </p>
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !customerId || !warehouseId || !products.length}
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}
