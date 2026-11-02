"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  status: "ACTIVE" | "ARCHIVED";
  parent: { id: string; name: string } | null;
};
type Unit = {
  id: string;
  code: string;
  name: string;
  precision: number;
  status: "ACTIVE" | "ARCHIVED";
};
type PageResult<T> = { data: T[]; total: number };

function CatalogManager() {
  const { organization, authenticatedRequest } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [parentId, setParentId] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [precision, setPrecision] = useState("0");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );

  const reload = useCallback(async () => {
    if (!organization) {
      setCategories([]);
      setUnits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = "page=1&page_size=100&status=ACTIVE";
      const [categoryResult, unitResult] = await Promise.all([
        authenticatedRequest<PageResult<Category>>(
          `/organizations/current/catalog/categories?${query}`,
        ),
        authenticatedRequest<PageResult<Unit>>(
          `/organizations/current/catalog/units?${query}`,
        ),
      ]);
      setCategories(categoryResult.data);
      setUnits(unitResult.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load catalog setup.",
      );
    } finally {
      setLoading(false);
    }
  }, [organization, authenticatedRequest]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await authenticatedRequest("/organizations/current/catalog/categories", {
        name: categoryName,
        ...(parentId ? { parentId } : {}),
      });
      setCategoryName("");
      setParentId("");
      setMessage("Category created.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create category.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await authenticatedRequest("/organizations/current/catalog/units", {
        code: unitCode,
        name: unitName,
        precision: Number(precision),
      });
      setUnitCode("");
      setUnitName("");
      setPrecision("0");
      setMessage("Unit created.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create unit.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="catalog-page">
      <header className="catalog-heading">
        <div>
          <Link href="/" className="catalog-back">
            ← Dashboard
          </Link>
          <p className="eyebrow">PRODUCT SETUP</p>
          <h1>Categories and units</h1>
          <p className="catalog-description">
            Organize your product list and define how stock quantities are
            measured.
          </p>
        </div>
        <Link className="catalog-secondary-link" href="/locations">
          Branches and warehouses <span aria-hidden="true">→</span>
        </Link>
      </header>

      {message && (
        <p className="catalog-notice" role="status">
          {message}
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
          <p>Catalog items belong to the active organization.</p>
          <Link className="primary-button" href="/organizations">
            Manage organizations
          </Link>
        </section>
      ) : loading ? (
        <div className="catalog-loading" role="status">
          Loading catalog setup…
        </div>
      ) : (
        <div className="catalog-grid">
          <section className="catalog-panel" aria-labelledby="categories-title">
            <div className="catalog-panel-heading">
              <div>
                <p className="eyebrow">PRODUCT GROUPS</p>
                <h2 id="categories-title">Categories</h2>
              </div>
              <span className="catalog-count">{categories.length} active</span>
            </div>
            {categories.length ? (
              <ul className="catalog-list">
                {categories.map((category) => (
                  <li key={category.id}>
                    <span className="catalog-list-icon" aria-hidden="true">
                      ▦
                    </span>
                    <span className="catalog-list-copy">
                      <strong>{category.name}</strong>
                      <small>
                        {category.parent
                          ? `Under ${category.parent.name}`
                          : "Top-level category"}
                      </small>
                    </span>
                    <span className="catalog-status">Active</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="catalog-empty-note">
                No categories yet. Add one to make products easier to find.
              </p>
            )}
            {canWrite ? (
              <form
                className="catalog-form"
                onSubmit={(event) => void createCategory(event)}
              >
                <h3>Add a category</h3>
                <label>
                  Category name
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                  />
                </label>
                <label>
                  Parent category <span>(optional)</span>
                  <select
                    value={parentId}
                    onChange={(event) => setParentId(event.target.value)}
                  >
                    <option value="">No parent</option>
                    {categories.map((category) => (
                      <option value={category.id} key={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Saving…" : "Add category"}
                </button>
              </form>
            ) : (
              <p className="catalog-readonly">
                You have view-only catalog access.
              </p>
            )}
          </section>

          <section className="catalog-panel" aria-labelledby="units-title">
            <div className="catalog-panel-heading">
              <div>
                <p className="eyebrow">MEASUREMENT</p>
                <h2 id="units-title">Units of measure</h2>
              </div>
              <span className="catalog-count">{units.length} active</span>
            </div>
            {units.length ? (
              <ul className="catalog-list">
                {units.map((unit) => (
                  <li key={unit.id}>
                    <span className="catalog-unit-code">{unit.code}</span>
                    <span className="catalog-list-copy">
                      <strong>{unit.name}</strong>
                      <small>
                        {unit.precision === 0
                          ? "Whole quantities"
                          : `Up to ${unit.precision} decimal places`}
                      </small>
                    </span>
                    <span className="catalog-status">Active</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="catalog-empty-note">
                No units yet. Add the measures your team uses to track stock.
              </p>
            )}
            {canWrite ? (
              <form
                className="catalog-form"
                onSubmit={(event) => void createUnit(event)}
              >
                <h3>Add a unit</h3>
                <div className="catalog-form-row">
                  <label>
                    Unit code
                    <input
                      required
                      minLength={1}
                      maxLength={24}
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                      value={unitCode}
                      onChange={(event) => setUnitCode(event.target.value)}
                      placeholder="e.g. PCS"
                    />
                  </label>
                  <label>
                    Display name
                    <input
                      required
                      minLength={1}
                      maxLength={80}
                      value={unitName}
                      onChange={(event) => setUnitName(event.target.value)}
                      placeholder="e.g. Pieces"
                    />
                  </label>
                </div>
                <label>
                  Quantity precision
                  <select
                    value={precision}
                    onChange={(event) => setPrecision(event.target.value)}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                      <option key={value} value={value}>
                        {value} decimal {value === 1 ? "place" : "places"}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="catalog-form-hint">
                  Product-specific pack conversions are configured with each
                  product.
                </p>
                <button
                  className="primary-button"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Saving…" : "Add unit"}
                </button>
              </form>
            ) : (
              <p className="catalog-readonly">
                You have view-only catalog access.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default function CatalogPage() {
  return (
    <ProtectedContent>
      <CatalogManager />
    </ProtectedContent>
  );
}
