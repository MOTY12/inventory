"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "../../../../features/auth/session-provider";

type Option = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  defaultSalePrice: string | null;
  baseUnit: { id: string; code: string };
  unitConversions: { unit: { id: string; code: string } }[];
};
type EditableLine = {
  productId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};
type Order = {
  id: string;
  status: string;
  customerId: string;
  warehouseId: string;
  currency: string;
  orderDate: string;
  expectedFulfillmentAt: string | null;
  notes: string | null;
  lines: {
    productId: string;
    unitId: string;
    orderedQuantity: string;
    unitPrice: string;
  }[];
};
const endpoint = "/organizations/current/sales/orders";

export default function EditSalesOrderPage() {
  const { salesOrderId } = useParams<{ salesOrderId: string }>();
  const router = useRouter();
  const { authenticatedRequest, organization } = useSession();
  const [order, setOrder] = useState<Order | null>(null);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [orderDate, setOrderDate] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const [detail, c, w, p] = await Promise.all([
          authenticatedRequest<Order>(`${endpoint}/${salesOrderId}`),
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
        setOrder(detail);
        setCustomers(c.data);
        setWarehouses(w.data);
        setProducts(p.data);
        setCustomerId(detail.customerId);
        setWarehouseId(detail.warehouseId);
        setCurrency(detail.currency);
        setOrderDate(detail.orderDate.slice(0, 10));
        setExpected(detail.expectedFulfillmentAt?.slice(0, 10) ?? "");
        setNotes(detail.notes ?? "");
        setLines(
          detail.lines.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
            quantity: line.orderedQuantity,
            unitPrice: line.unitPrice,
          })),
        );
        if (detail.status !== "DRAFT")
          setError("Only a draft order can be edited.");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Order could not be loaded.",
        );
      }
    })();
  }, [authenticatedRequest, salesOrderId]);
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${endpoint}/${salesOrderId}`,
        {
          customerId,
          warehouseId,
          currency,
          orderDate,
          expectedFulfillmentAt: expected || undefined,
          notes: notes || undefined,
          lines,
        },
        "PATCH",
      );
      router.push(`/sales-orders/${salesOrderId}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Order could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES / EDIT DRAFT</p>
          <h1>Edit {order?.id ? "sales order" : "draft"}</h1>
          <p>Changes to this draft do not reserve stock.</p>
        </div>
        <Link
          className="button button-secondary"
          href={`/sales-orders/${salesOrderId}`}
        >
          Back to order
        </Link>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {!order ? (
        <section className="panel">
          <p>Loading draft…</p>
        </section>
      ) : !canWrite || order.status !== "DRAFT" ? (
        <section className="panel">
          <p>This order cannot be edited in its current state.</p>
        </section>
      ) : (
        <form className="panel order-editor" onSubmit={save}>
          <div className="form-grid">
            <label>
              Customer
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                {customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Warehouse
              <select
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                {warehouses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency
              <input
                value={currency}
                maxLength={3}
                pattern="[A-Z]{3}"
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
              />
            </label>
            <label>
              Order date
              <input
                type="date"
                value={orderDate}
                onChange={(event) => setOrderDate(event.target.value)}
              />
            </label>
            <label>
              Expected fulfillment
              <input
                type="date"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
              />
            </label>
            <label>
              Notes
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
          <div className="product-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Unit price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const product = products.find(
                    (item) => item.id === line.productId,
                  );
                  const units = product
                    ? [
                        product.baseUnit,
                        ...product.unitConversions.map(
                          (conversion) => conversion.unit,
                        ),
                      ]
                    : [];
                  return (
                    <tr key={index}>
                      <td>
                        <select
                          value={line.productId}
                          onChange={(event) => {
                            const selected = products.find(
                              (item) => item.id === event.target.value,
                            );
                            setLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      productId: event.target.value,
                                      unitId: selected?.baseUnit.id ?? "",
                                      unitPrice:
                                        selected?.defaultSalePrice ?? "0",
                                    }
                                  : row,
                              ),
                            );
                          }}
                        >
                          {products.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.sku}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={line.unitId}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, unitId: event.target.value }
                                  : row,
                              ),
                            )
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
                        <input
                          aria-label="Quantity"
                          value={line.quantity}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, quantity: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label="Unit price"
                          value={line.unitPrice}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, unitPrice: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((_, i) => i !== index),
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
          <div className="order-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                const product = products[0];
                if (product)
                  setLines((current) => [
                    ...current,
                    {
                      productId: product.id,
                      unitId: product.baseUnit.id,
                      quantity: "1",
                      unitPrice: product.defaultSalePrice ?? "0",
                    },
                  ]);
              }}
            >
              Add line
            </button>
            <span>
              Stock is checked and reserved when the order is confirmed.
            </span>
            <button className="button button-primary" disabled={busy}>
              {busy ? "Saving…" : "Save draft"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
