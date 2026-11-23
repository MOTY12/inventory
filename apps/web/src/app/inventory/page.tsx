"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";

type Warehouse = { id: string; name: string; code: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  baseUnit: { code: string; name: string };
};
type Adjustment = {
  id: string;
  productId: string;
  reason: string;
  systemQuantity: string;
  countedQuantity: string;
  status: "DRAFT" | "POSTED";
  createdAt: string;
};
type Movement = {
  id: string;
  movementType: string;
  quantityDelta: string;
  documentType: string;
  occurredAt: string;
  product: { name: string; sku: string };
};
type Balance = {
  productId: string;
  onHand: string;
  reserved: string;
  inTransit: string;
  product: {
    id: string;
    name: string;
    sku: string;
    baseUnit: { code: string; name: string };
  };
};
type Page<T> = { data: T[]; total: number };

function subtractQuantities(left: string, right: string): string {
  const scale = BigInt(1_000_000);
  const toScaled = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * scale + BigInt(fraction.padEnd(6, "0"));
  };
  const difference = toScaled(left) - toScaled(right);
  const sign = difference < BigInt(0) ? "-" : "";
  const absolute = difference < BigInt(0) ? -difference : difference;
  return `${sign}${absolute / scale}.${String(absolute % scale).padStart(6, "0")}`;
}

function InventoryManager() {
  const { organization, authenticatedRequest } = useSession();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [balancePage, setBalancePage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "BUYER",
    "WAREHOUSE_CLERK",
  ].includes(organization?.role ?? "");
  const selectedProduct = products.find((product) => product.id === productId);

  const reload = useCallback(async () => {
    if (!organization) {
      setWarehouses([]);
      setProducts([]);
      setAdjustments([]);
      setMovements([]);
      setBalances([]);
      setBalanceTotal(0);
      setWarehouseId("");
      setProductId("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [locations, catalog] = await Promise.all([
        authenticatedRequest<Page<Warehouse>>(
          "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
        ),
        authenticatedRequest<Page<Product>>(
          "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setWarehouses(locations.data);
      setProducts(catalog.data);
      const selected = locations.data.some(
        (warehouse) => warehouse.id === warehouseId,
      )
        ? warehouseId
        : locations.data[0]?.id || "";
      setWarehouseId(selected);
      setProductId((current) =>
        catalog.data.some((product) => product.id === current) ? current : "",
      );
      if (selected) {
        const [counts, movementResult, balanceResult] = await Promise.all([
          authenticatedRequest<Page<Adjustment>>(
            `/inventory/warehouses/${selected}/adjustments?page=1&page_size=100`,
          ),
          authenticatedRequest<Page<Movement>>(
            `/inventory/warehouses/${selected}/movements?page=1&page_size=50`,
          ),
          authenticatedRequest<Page<Balance>>(
            `/inventory/warehouses/${selected}/balances?page=${balancePage}&page_size=100`,
          ),
        ]);
        setAdjustments(counts.data);
        setMovements(movementResult.data);
        setBalances(balanceResult.data);
        setBalanceTotal(balanceResult.total);
      } else {
        setAdjustments([]);
        setMovements([]);
        setBalances([]);
        setBalanceTotal(0);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load inventory.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, balancePage, organization, warehouseId]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function createCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!warehouseId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const draft = await authenticatedRequest<Adjustment>(
        `/inventory/warehouses/${warehouseId}/adjustments`,
        { productId, countedQuantity, reason },
        "POST",
      );
      setNotice(
        `Count saved. Variance: ${subtractQuantities(draft.countedQuantity, draft.systemQuantity)} base units.`,
      );
      setCountedQuantity("");
      setReason("");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the count.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function postCount(id: string) {
    if (
      !window.confirm(
        "Post this count variance to on-hand stock? This creates an immutable inventory movement.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `/inventory/warehouses/${warehouseId}/adjustments/${id}/post`,
        {},
        "POST",
      );
      setNotice("Count variance posted to the stock ledger.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not post the count.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="inventory-page">
      <header className="products-heading">
        <div>
          <Link href="/products" className="catalog-back">
            ← Products
          </Link>
          <p className="catalog-eyebrow">STOCK CONTROL</p>
          <h1>Inventory counts</h1>
          <p>
            Record physical counts, review variances, and post authorized
            changes.
          </p>
        </div>
        <Link className="catalog-secondary-link" href="/">
          Dashboard
        </Link>
      </header>
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
      <section className="product-editor">
        {loading ? (
          <p className="catalog-loading" role="status">
            Loading warehouse inventory…
          </p>
        ) : warehouses.length === 0 ? (
          <div className="catalog-empty">
            <h2>Add a warehouse to begin counting stock</h2>
            <p>Inventory counts and balances are recorded by warehouse.</p>
            <Link className="catalog-secondary-link" href="/locations">
              Set up a warehouse
            </Link>
          </div>
        ) : (
          <>
            <label>
              Warehouse
              <select
                value={warehouseId}
                onChange={(event) => {
                  setBalancePage(1);
                  setWarehouseId(event.target.value);
                }}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </label>
            {canWrite ? (
              <form
                onSubmit={createCount}
                className="inventory-count-form"
                aria-labelledby="count-form-title"
              >
                <h2 id="count-form-title">Record a physical count</h2>
                <p className="catalog-form-hint">
                  A draft captures the current system quantity. Posting writes
                  only the variance to the stock ledger.
                </p>
                <label>
                  Product
                  <select
                    required
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                  >
                    <option value="">Choose a product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.sku} · {product.baseUnit.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Counted quantity
                  <span className="inventory-field-hint">
                    {selectedProduct
                      ? `Enter ${selectedProduct.baseUnit.name} (${selectedProduct.baseUnit.code})`
                      : "Select a product to see its base unit"}
                  </span>
                  <input
                    required
                    inputMode="decimal"
                    pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?"
                    value={countedQuantity}
                    onChange={(event) => setCountedQuantity(event.target.value)}
                  />
                </label>
                <label>
                  Reason
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="For example: monthly shelf count"
                  />
                </label>
                <button
                  className="catalog-primary-button"
                  disabled={busy || !warehouseId || !products.length}
                  type="submit"
                >
                  {busy ? "Saving…" : "Save count draft"}
                </button>
              </form>
            ) : (
              <p className="catalog-readonly">
                You have view-only inventory access. Contact an organization
                administrator if you need to record counts.
              </p>
            )}
          </>
        )}
      </section>
      {warehouseId && (
        <section
          className="inventory-count-list"
          aria-labelledby="balance-title"
        >
          <div className="inventory-section-heading">
            <div>
              <h2 id="balance-title">Warehouse stock overview</h2>
              <p>
                On hand includes reserved stock. Available is on hand minus
                reservations; in-transit stock is separate.
              </p>
            </div>
            <span>{balanceTotal} product balances</span>
          </div>
          {loading ? (
            <p role="status">Loading balances…</p>
          ) : balances.length === 0 ? (
            <div className="empty-state">
              <strong>No stock balances in this warehouse</strong>
              <p>Receive stock or post an opening count to create balances.</p>
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>On hand</th>
                      <th>Reserved</th>
                      <th>Available</th>
                      <th>In transit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((balance) => (
                      <tr key={balance.productId}>
                        <td>
                          <Link href={`/products/${balance.product.id}`}>
                            {balance.product.name}
                          </Link>
                          <small>{balance.product.baseUnit.code}</small>
                        </td>
                        <td>{balance.product.sku}</td>
                        <td>{balance.onHand}</td>
                        <td>{balance.reserved}</td>
                        <td>
                          {subtractQuantities(balance.onHand, balance.reserved)}
                        </td>
                        <td>{balance.inTransit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {balanceTotal > 100 && (
                <nav
                  aria-label="Warehouse balance pages"
                  className="product-pagination"
                >
                  <span>
                    Showing {(balancePage - 1) * 100 + 1}–
                    {Math.min(balancePage * 100, balanceTotal)} of{" "}
                    {balanceTotal}
                  </span>
                  <div>
                    <button
                      className="catalog-text-button"
                      disabled={balancePage <= 1}
                      onClick={() => setBalancePage((page) => page - 1)}
                      type="button"
                    >
                      Previous
                    </button>
                    <span>
                      Page {balancePage} of {Math.ceil(balanceTotal / 100)}
                    </span>
                    <button
                      className="catalog-text-button"
                      disabled={balancePage >= Math.ceil(balanceTotal / 100)}
                      onClick={() => setBalancePage((page) => page + 1)}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </section>
      )}
      <section className="inventory-count-list">
        <h2>Count history</h2>
        {loading ? (
          <p role="status">Loading counts…</p>
        ) : adjustments.length === 0 ? (
          <p>No counts recorded for this warehouse.</p>
        ) : (
          adjustments.map((a) => {
            const product = products.find((p) => p.id === a.productId);
            const variance = subtractQuantities(
              a.countedQuantity,
              a.systemQuantity,
            );
            return (
              <article className="inventory-count-row" key={a.id}>
                <div>
                  <strong>{product?.name ?? a.productId}</strong>
                  <span>
                    {product?.sku ?? ""} · {a.reason}
                  </span>
                  <small>
                    System {a.systemQuantity} · Counted {a.countedQuantity} ·
                    Variance {variance}
                    {product ? ` ${product.baseUnit.code}` : ""}
                  </small>
                </div>
                <div>
                  <span
                    className={`inventory-status inventory-status-${a.status.toLowerCase()}`}
                  >
                    {a.status}
                  </span>
                  {a.status === "DRAFT" && canWrite && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void postCount(a.id)}
                    >
                      Post variance
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
      <section className="inventory-count-list">
        <h2>Stock movement history</h2>
        {loading ? (
          <p role="status">Loading movements…</p>
        ) : movements.length === 0 ? (
          <p>No stock movements recorded for this warehouse.</p>
        ) : (
          movements.map((movement) => (
            <article className="inventory-count-row" key={movement.id}>
              <div>
                <strong>
                  {movement.product.name} · {movement.product.sku}
                </strong>
                <span>
                  {movement.movementType} · {movement.documentType}
                </span>
                <small>{new Date(movement.occurredAt).toLocaleString()}</small>
              </div>
              <strong>{movement.quantityDelta}</strong>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

export default function InventoryPage() {
  return (
    <ProtectedContent>
      <InventoryManager />
    </ProtectedContent>
  );
}
