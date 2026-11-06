"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";

type Warehouse = { id: string; name: string; code: string };
type Product = { id: string; name: string; sku: string };
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
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!organization) return;
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
      const selected = warehouseId || locations.data[0]?.id || "";
      setWarehouseId(selected);
      setAdjustments(
        selected
          ? (
              await authenticatedRequest<Page<Adjustment>>(
                `/inventory/warehouses/${selected}/adjustments?page=1&page_size=100`,
              )
            ).data
          : [],
      );
      setMovements(
        selected
          ? (
              await authenticatedRequest<Page<Movement>>(
                `/inventory/warehouses/${selected}/movements?page=1&page_size=50`,
              )
            ).data
          : [],
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load inventory.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, warehouseId]);

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
        <p className="catalog-error" role="alert">
          {error}
        </p>
      )}
      <section className="product-editor">
        <label>
          Warehouse
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={createCount} className="inventory-count-form">
          <h2>Record a physical count</h2>
          <label>
            Product
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Choose a product</option>
              {products
                .filter((p) => p.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.sku}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Counted quantity
            <input
              required
              inputMode="decimal"
              pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?"
              value={countedQuantity}
              onChange={(e) => setCountedQuantity(e.target.value)}
            />
          </label>
          <label>
            Reason
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="catalog-primary-button"
            disabled={busy || !warehouseId || !products.length}
          >
            {busy ? "Saving…" : "Save count"}
          </button>
        </form>
      </section>
      <section className="inventory-count-list">
        <h2>Count history</h2>
        {loading ? (
          <p>Loading counts…</p>
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
                  </small>
                </div>
                <div>
                  <span
                    className={`inventory-status inventory-status-${a.status.toLowerCase()}`}
                  >
                    {a.status}
                  </span>
                  {a.status === "DRAFT" && (
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
          <p>Loading movements…</p>
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
