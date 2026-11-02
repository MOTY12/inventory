"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ProtectedContent,
  useSession,
} from "../../../features/auth/session-provider";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  type: string;
  trackInventory: boolean;
  status: string;
  category: { name: string } | null;
  baseUnit: { id: string; code: string; name: string };
  unitConversions: Conversion[];
};
type Conversion = {
  unitId: string;
  baseQuantity: string;
  unit: { id: string; code: string; name: string; precision: number };
};
type Unit = { id: string; code: string; name: string };

function ProductDetails() {
  const params = useParams<{ productId: string }>();
  const { organization, authenticatedRequest } = useSession();
  const [product, setProduct] = useState<Product | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [factor, setFactor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const reload = useCallback(async () => {
    if (!organization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [details, unitResult] = await Promise.all([
        authenticatedRequest<Product>(
          `/organizations/current/catalog/products/${params.productId}`,
        ),
        authenticatedRequest<{ data: Unit[] }>(
          "/organizations/current/catalog/units?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setProduct(details);
      setUnits(unitResult.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load product.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, params.productId]);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function addConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `/organizations/current/catalog/products/${params.productId}/unit-conversions`,
        { unitId, baseQuantity: factor },
        "POST",
      );
      setUnitId("");
      setFactor("");
      setNotice("Unit conversion added.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add conversion.",
      );
    } finally {
      setBusy(false);
    }
  }

  const availableUnits = units.filter(
    (u) =>
      u.id !== product?.baseUnit.id &&
      !product?.unitConversions.some((c) => c.unitId === u.id),
  );
  return (
    <main className="products-page">
      <header className="products-heading">
        <div>
          <Link href="/products" className="catalog-back">
            ← Products
          </Link>
          <p className="catalog-eyebrow">PRODUCT DETAILS</p>
          <h1>{product?.name || "Product"}</h1>
          <p>Product identity and product-specific unit conversions.</p>
        </div>
        <Link className="catalog-secondary-link" href="/catalog">
          Catalog setup
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
      {loading ? (
        <div className="catalog-loading">Loading product…</div>
      ) : (
        product && (
          <>
            <section className="product-detail-card">
              <div>
                <span className="catalog-eyebrow">
                  {product.status} ·{" "}
                  {product.type === "STOCKED" ? "STOCKED" : "NON-STOCK"}
                </span>
                <h2>{product.name}</h2>
                <p>{product.description || "No description"}</p>
              </div>
              <dl>
                <div>
                  <dt>SKU</dt>
                  <dd>{product.sku}</dd>
                </div>
                <div>
                  <dt>Barcode</dt>
                  <dd>{product.barcode || "—"}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{product.category?.name || "Uncategorized"}</dd>
                </div>
                <div>
                  <dt>Inventory tracking</dt>
                  <dd>{product.trackInventory ? "Enabled" : "Disabled"}</dd>
                </div>
              </dl>
            </section>
            <section className="product-list-panel">
              <div className="catalog-panel-heading">
                <div>
                  <span className="catalog-eyebrow">UNITS OF MEASURE</span>
                  <h2>Conversions</h2>
                  <p>
                    Each factor states how many base units are in one selected
                    unit.
                  </p>
                </div>
              </div>
              <div className="conversion-base">
                <strong>
                  {product.baseUnit.name} ({product.baseUnit.code})
                </strong>
                <span>Base unit · 1 {product.baseUnit.code} = 1 base unit</span>
              </div>
              <ul className="conversion-list">
                {product.unitConversions.map((c) => (
                  <li key={c.unitId}>
                    <strong>
                      {c.unit.name} ({c.unit.code})
                    </strong>
                    <span>
                      1 {c.unit.code} = {c.baseQuantity} {product.baseUnit.code}
                    </span>
                  </li>
                ))}
                {product.unitConversions.length === 0 && (
                  <li className="conversion-empty">
                    No alternate units have been defined.
                  </li>
                )}
              </ul>
              {canWrite && product.status === "ACTIVE" && (
                <form className="conversion-form" onSubmit={addConversion}>
                  <h3>Add product unit conversion</h3>
                  <div className="product-form-grid">
                    <label>
                      Alternate unit
                      <select
                        required
                        value={unitId}
                        onChange={(e) => setUnitId(e.target.value)}
                      >
                        <option value="">Choose unit</option>
                        {availableUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Base units per alternate unit
                      <input
                        required
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        value={factor}
                        onChange={(e) => setFactor(e.target.value)}
                        placeholder="e.g. 12"
                      />
                    </label>
                  </div>
                  <p className="catalog-form-hint">
                    Conversion applies only to this product. It cannot be
                    changed after creation; archive and recreate is not
                    supported yet.
                  </p>
                  <button
                    className="catalog-primary-button"
                    disabled={busy || !availableUnits.length}
                  >
                    {busy ? "Saving…" : "Add conversion"}
                  </button>
                </form>
              )}
            </section>
          </>
        )
      )}
    </main>
  );
}

export default function ProductDetailPage() {
  return (
    <ProtectedContent>
      <ProductDetails />
    </ProtectedContent>
  );
}
