"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../../features/auth/session-provider";
import {
  formatDecimal,
  sumLineAmounts,
} from "../../features/procurement/decimal";

type Option = {
  id: string;
  name: string;
  sku?: string;
  code?: string;
  baseUnitId?: string;
  baseUnit?: { id: string; code: string; name: string };
  unitConversions?: { unitId: string; unit: { code: string; name: string } }[];
};
type Order = {
  id: string;
  number: string;
  status: string;
  currency: string;
  subtotal: string;
  supplier: { name: string };
  warehouse: { name: string };
  _count: { lines: number; receipts: number };
};
type Page<T> = { data: T[]; total: number; page: number; page_size: number };
type Line = {
  productId: string;
  unitId: string;
  quantity: string;
  unitCost: string;
};
const base = "/organizations/current/procurement";

export default function PurchaseOrdersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { productId: "", unitId: "", quantity: "1", unitCost: "0" },
  ]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );

  const load = useCallback(async () => {
    if (!organization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (status) params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const [result, supplierResult, warehouseResult, productResult] =
        await Promise.all([
          authenticatedRequest<Page<Order>>(
            `${base}/purchase-orders?${params}`,
          ),
          authenticatedRequest<Page<Option>>(
            `${base}/suppliers?page=1&page_size=100&status=ACTIVE`,
          ),
          authenticatedRequest<Page<Option>>(
            "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
          ),
          authenticatedRequest<Page<Option>>(
            "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
          ),
        ]);
      setOrders(result.data);
      setTotalOrders(result.total);
      setSuppliers(supplierResult.data);
      setWarehouses(warehouseResult.data);
      setProducts(productResult.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load purchasing data.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, page, query, status]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function updateLine(index: number, key: keyof Line, value: string) {
    setLines((old) =>
      old.map((line, i) =>
        i === index
          ? {
              ...line,
              [key]: value,
              ...(key === "productId"
                ? {
                    unitId:
                      products.find((item) => item.id === value)?.baseUnitId ??
                      "",
                  }
                : {}),
            }
          : line,
      ),
    );
  }
  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const order = await authenticatedRequest<{ id: string; number: string }>(
        `${base}/purchase-orders`,
        {
          supplierId,
          warehouseId,
          currency,
          expectedDeliveryAt: expectedDeliveryAt || undefined,
          lines,
        },
        "POST",
      );
      setNotice(`${order.number} created as a draft.`);
      setLines([{ productId: "", unitId: "", quantity: "1", unitCost: "0" }]);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create purchase order.",
      );
    } finally {
      setBusy(false);
    }
  }
  const total = sumLineAmounts(lines);

  return (
    <main className="products-page">
      <header className="products-heading">
        <div>
          <Link href="/" className="catalog-back">
            ← Dashboard
          </Link>
          <p className="catalog-eyebrow">PURCHASING</p>
          <h1>Purchase orders</h1>
          <p>
            Create supplier orders, track receipts, and keep stock changes tied
            to posted deliveries.
          </p>
        </div>
        <Link className="catalog-secondary-link" href="/suppliers">
          Suppliers
        </Link>
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
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <Link className="primary-button" href="/organizations">
            Manage organizations
          </Link>
        </section>
      ) : (
        <>
          {canWrite && (
            <form className="product-editor" onSubmit={createDraft}>
              <div className="catalog-panel-heading">
                <div>
                  <span className="catalog-eyebrow">NEW PURCHASE ORDER</span>
                  <h2>Start a draft</h2>
                </div>
              </div>
              <div className="catalog-form-grid">
                <label>
                  Supplier
                  <select
                    required
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                  >
                    <option value="">Choose supplier</option>
                    {suppliers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination warehouse
                  <select
                    required
                    value={warehouseId}
                    onChange={(event) => setWarehouseId(event.target.value)}
                  >
                    <option value="">Choose warehouse</option>
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
                    required
                    maxLength={3}
                    minLength={3}
                    value={currency}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                  />
                </label>
                <label>
                  Expected delivery
                  <input
                    type="date"
                    value={expectedDeliveryAt}
                    onChange={(event) =>
                      setExpectedDeliveryAt(event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="catalog-panel-heading">
                <div>
                  <span className="catalog-eyebrow">ORDER LINES</span>
                  <h2>Products and quantities</h2>
                </div>
                <button
                  className="catalog-secondary-link"
                  type="button"
                  onClick={() =>
                    setLines((old) => [
                      ...old,
                      {
                        productId: "",
                        unitId: "",
                        quantity: "1",
                        unitCost: "0",
                      },
                    ])
                  }
                >
                  Add line
                </button>
              </div>
              <div className="po-line-list">
                {lines.map((line, index) => (
                  <div className="po-line" key={index}>
                    <label>
                      Product
                      <select
                        required
                        value={line.productId}
                        onChange={(event) =>
                          updateLine(index, "productId", event.target.value)
                        }
                      >
                        <option value="">Choose product</option>
                        {products.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.sku}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Unit
                      <select
                        required
                        value={line.unitId}
                        disabled={!line.productId}
                        onChange={(event) =>
                          updateLine(index, "unitId", event.target.value)
                        }
                      >
                        <option value="">Choose unit</option>
                        {(() => {
                          const product = products.find(
                            (item) => item.id === line.productId,
                          );
                          return product ? (
                            <>
                              <option value={product.baseUnitId}>
                                {product.baseUnit?.name ?? "Base unit"} (
                                {product.baseUnit?.code})
                              </option>
                              {product.unitConversions?.map((conversion) => (
                                <option
                                  key={conversion.unitId}
                                  value={conversion.unitId}
                                >
                                  {conversion.unit.name} ({conversion.unit.code}
                                  )
                                </option>
                              ))}
                            </>
                          ) : null;
                        })()}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        required
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(index, "quantity", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Unit cost
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.unitCost}
                        onChange={(event) =>
                          updateLine(index, "unitCost", event.target.value)
                        }
                      />
                    </label>
                    {lines.length > 1 && (
                      <button
                        className="catalog-text-button"
                        type="button"
                        onClick={() =>
                          setLines((old) => old.filter((_, i) => i !== index))
                        }
                        aria-label={`Remove line ${index + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="po-total">
                <span>Draft subtotal</span>
                <strong>
                  {currency} {total}
                </strong>
              </div>
              <button className="primary-button" disabled={busy}>
                {busy ? "Saving…" : "Create draft"}
              </button>
            </form>
          )}
          <section className="catalog-panel">
            <div className="catalog-panel-heading">
              <div>
                <span className="catalog-eyebrow">ORDER REGISTER</span>
                <h2>Recent purchasing</h2>
              </div>
            </div>
            <div className="catalog-toolbar">
              <label>
                Search
                <input
                  value={query}
                  onChange={(event) => {
                    setPage(1);
                    setQuery(event.target.value);
                  }}
                  placeholder="PO number or supplier"
                />
              </label>
              <label>
                Status
                <select
                  value={status}
                  onChange={(event) => {
                    setPage(1);
                    setStatus(event.target.value);
                  }}
                >
                  <option value="">All statuses</option>
                  {[
                    "DRAFT",
                    "SUBMITTED",
                    "PARTIALLY_RECEIVED",
                    "RECEIVED",
                    "CANCELLED",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            {loading ? (
              <p>Loading purchase orders…</p>
            ) : orders.length === 0 ? (
              <div className="catalog-empty">
                <h3>No purchase orders yet</h3>
                <p>New drafts will appear here.</p>
              </div>
            ) : (
              <div className="catalog-table-wrap">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Supplier</th>
                      <th>Warehouse</th>
                      <th>Status</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.number}</strong>
                          <small>
                            {order._count.lines} lines · {order._count.receipts}{" "}
                            receipts
                          </small>
                        </td>
                        <td>{order.supplier.name}</td>
                        <td>{order.warehouse.name}</td>
                        <td>
                          <span className="status-pill">
                            {order.status.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>
                          {order.currency} {formatDecimal(order.subtotal)}
                        </td>
                        <td>
                          <Link
                            className="catalog-text-button"
                            href={`/purchase-orders/${order.id}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="po-pagination" aria-label="Purchase order pages">
              <span>
                {totalOrders} orders · page {page} of{" "}
                {Math.max(1, Math.ceil(totalOrders / 20))}
              </span>
              <div>
                <button
                  className="catalog-secondary-link"
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </button>
                <button
                  className="catalog-secondary-link"
                  type="button"
                  disabled={page * 20 >= totalOrders || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
