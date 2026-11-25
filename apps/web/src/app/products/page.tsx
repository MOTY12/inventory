"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";
import { Drawer } from "../../components/ui/drawer";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  type: "STOCKED" | "NON_STOCK";
  trackInventory: boolean;
  defaultCost: string | null;
  costCurrency: string | null;
  defaultSalePrice: string | null;
  saleCurrency: string | null;
  status: "ACTIVE" | "ARCHIVED";
  categoryId: string | null;
  baseUnitId: string;
  category: { id: string; name: string } | null;
  baseUnit: { id: string; code: string; name: string };
};
type Choice = { id: string; name: string; code?: string };
type Page<T> = { data: T[]; total: number };

function ProductManager() {
  const { organization, authenticatedRequest } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Choice[]>([]);
  const [units, setUnits] = useState<Choice[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED" | "">("ACTIVE");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [baseUnitId, setBaseUnitId] = useState("");
  const [type, setType] = useState<Product["type"]>("STOCKED");
  const [trackInventory, setTrackInventory] = useState(true);
  const [defaultCost, setDefaultCost] = useState("");
  const [costCurrency, setCostCurrency] = useState("NGN");
  const [defaultSalePrice, setDefaultSalePrice] = useState("");
  const [saleCurrency, setSaleCurrency] = useState("NGN");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const columns: DataTableColumn<Product>[] = [
    {
      key: "product",
      header: "Product",
      render: (p) => (
        <Link className="ui-primary-cell" href={`/products/${p.id}`}>
          {p.name}
        </Link>
      ),
    },
    {
      key: "sku",
      header: "SKU / barcode",
      render: (p) => (
        <>
          {p.sku}
          <small>{p.barcode || "No barcode"}</small>
        </>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (p) => p.category?.name || "—",
    },
    {
      key: "unit",
      header: "Base unit",
      render: (p) => `${p.baseUnit.name} (${p.baseUnit.code})`,
    },
    ...(canWrite
      ? [
          {
            key: "price",
            header: "Default cost / sale price",
            align: "right" as const,
            render: (p: Product) => (
              <>
                {p.defaultCost === null
                  ? "—"
                  : `${p.costCurrency ?? "—"} ${p.defaultCost}`}{" "}
                /{" "}
                {p.defaultSalePrice === null
                  ? "—"
                  : `${p.saleCurrency ?? "—"} ${p.defaultSalePrice}`}
              </>
            ),
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (p) =>
        p.status === "ACTIVE" && canWrite ? (
          <div className="ui-row-actions">
            <button
              className="ui-quiet-button"
              type="button"
              onClick={() => editProduct(p)}
            >
              Edit
            </button>
            <button
              className="ui-quiet-button ui-danger-button"
              type="button"
              disabled={busy}
              onClick={() => setArchiveTarget(p)}
            >
              Archive
            </button>
          </div>
        ) : (
          <span className="ui-muted-cell">—</span>
        ),
    },
  ];

  const reload = useCallback(async () => {
    if (!organization) {
      setProducts([]);
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
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      const [list, cats, uoms] = await Promise.all([
        authenticatedRequest<Page<Product>>(
          `/organizations/current/catalog/products?${params}`,
        ),
        authenticatedRequest<Page<Choice>>(
          "/organizations/current/catalog/categories?page=1&page_size=100&status=ACTIVE",
        ),
        authenticatedRequest<Page<Choice>>(
          "/organizations/current/catalog/units?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setProducts(list.data);
      setTotal(list.total);
      setCategories(cats.data);
      setUnits(uoms.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load products.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, page, query, status]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  function clearForm() {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setSku("");
    setBarcode("");
    setCategoryId("");
    setBaseUnitId("");
    setType("STOCKED");
    setTrackInventory(true);
    setDefaultCost("");
    setCostCurrency("NGN");
    setDefaultSalePrice("");
    setSaleCurrency("NGN");
    setDescription("");
  }

  function editProduct(product: Product) {
    setEditing(product.id);
    setFormOpen(true);
    setName(product.name);
    setSku(product.sku);
    setBarcode(product.barcode ?? "");
    setCategoryId(product.categoryId ?? "");
    setBaseUnitId(product.baseUnitId);
    setType(product.type);
    setTrackInventory(product.trackInventory);
    setDefaultCost(product.defaultCost ?? "");
    setCostCurrency(product.costCurrency ?? "NGN");
    setDefaultSalePrice(product.defaultSalePrice ?? "");
    setSaleCurrency(product.saleCurrency ?? "NGN");
    setDescription(product.description ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = {
        name,
        sku,
        barcode: barcode || undefined,
        categoryId: categoryId || null,
        baseUnitId,
        type,
        trackInventory: type === "STOCKED" && trackInventory,
        description: description || undefined,
        ...(defaultCost ? { defaultCost, costCurrency } : {}),
        ...(defaultSalePrice ? { defaultSalePrice, saleCurrency } : {}),
      };
      await authenticatedRequest(
        `/organizations/current/catalog/products${editing ? `/${editing}` : ""}`,
        body,
        editing ? "PATCH" : "POST",
      );
      setNotice(editing ? "Product updated." : "Product created.");
      clearForm();
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save product.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `/organizations/current/catalog/products/${archiveTarget.id}/archive`,
        {},
        "PATCH",
      );
      setNotice("Product archived.");
      setArchiveTarget(null);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive product.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="products-page">
      <div className="ui-page">
        <PageHeader
          eyebrow="PRODUCT CATALOG"
          title="Products"
          description="Manage your product catalog and inventory information."
          action={
            <>
              <Link href="/catalog" className="button button-secondary">
                Catalog setup
              </Link>
              <button
                aria-controls="product-editor"
                aria-expanded={formOpen || Boolean(editing)}
                className="button button-primary"
                onClick={() => {
                  clearForm();
                  setFormOpen(true);
                }}
                type="button"
              >
                ＋ Add product
              </button>
            </>
          }
        />
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
        {canWrite && (formOpen || editing) && (
          <Drawer
            open
            onClose={clearForm}
            title={editing ? "Edit product" : "Add product"}
            description="Manage product details, classification, and pricing."
          >
            <form
              className="product-editor ui-drawer-form"
              id="product-editor"
              onSubmit={save}
            >
              <div className="product-form-grid">
                <label>
                  Product name
                  <input
                    required
                    minLength={1}
                    maxLength={180}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  SKU
                  <input
                    required
                    minLength={1}
                    maxLength={80}
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </label>
                <label>
                  Barcode (optional)
                  <input
                    maxLength={100}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </label>
                <label>
                  Category
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Base unit
                  <select
                    required
                    value={baseUnitId}
                    onChange={(e) => setBaseUnitId(e.target.value)}
                  >
                    <option value="">Choose unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Product type
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Product["type"])}
                  >
                    <option value="STOCKED">Stocked</option>
                    <option value="NON_STOCK">Non-stock</option>
                  </select>
                </label>
                <label className="product-checkbox-field">
                  <span>Track inventory</span>
                  <input
                    type="checkbox"
                    checked={type === "STOCKED" && trackInventory}
                    disabled={type === "NON_STOCK"}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                  />
                </label>
                <label>
                  Default cost
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={defaultCost}
                    onChange={(e) => setDefaultCost(e.target.value)}
                  />
                </label>
                <label>
                  Cost currency
                  <input
                    required={Boolean(defaultCost)}
                    minLength={3}
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    value={costCurrency}
                    onChange={(e) =>
                      setCostCurrency(e.target.value.toUpperCase())
                    }
                  />
                </label>
                <label>
                  Default sale price
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={defaultSalePrice}
                    onChange={(e) => setDefaultSalePrice(e.target.value)}
                  />
                </label>
                <label>
                  Sale currency
                  <input
                    required={Boolean(defaultSalePrice)}
                    minLength={3}
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    value={saleCurrency}
                    onChange={(e) =>
                      setSaleCurrency(e.target.value.toUpperCase())
                    }
                  />
                </label>
                <label className="product-description-field">
                  Description
                  <textarea
                    maxLength={2000}
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
              {units.length === 0 && (
                <p className="catalog-form-hint">
                  Create at least one unit in Catalog setup before adding
                  products.
                </p>
              )}
              <div className="ui-drawer-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={clearForm}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy || units.length === 0}
                >
                  {busy
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create product"}
                </button>
              </div>
            </form>
          </Drawer>
        )}
        <section className="product-list-panel">
          <div className="catalog-panel-heading">
            <div>
              <span className="catalog-eyebrow">WORKSPACE INVENTORY</span>
              <h2>
                Product list{" "}
                <span className="catalog-count">{loading ? "…" : total}</span>
              </h2>
            </div>
            <div className="product-filters">
              <input
                aria-label="Search products"
                placeholder="Search name, SKU, barcode"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Filter product status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setPage(1);
                }}
              >
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
                <option value="">All statuses</option>
              </select>
            </div>
          </div>
          {
            <div className="product-table-wrap">
              <DataTable
                columns={columns}
                rows={products}
                rowKey={(p) => p.id}
                loading={loading}
                emptyTitle="No products found"
                emptyDescription={
                  query
                    ? "Try another search."
                    : "Create a product to start organizing this catalog."
                }
              />
              {!loading && total > 20 && (
                <nav
                  aria-label="Product list pages"
                  className="product-pagination"
                >
                  <span>
                    Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)}{" "}
                    of {total}
                  </span>
                  <div>
                    <button
                      className="catalog-text-button"
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {Math.ceil(total / 20)}
                    </span>
                    <button
                      className="catalog-text-button"
                      type="button"
                      disabled={page >= Math.ceil(total / 20)}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </div>
          }
        </section>
        <ConfirmDialog
          open={Boolean(archiveTarget)}
          title="Archive product?"
          description={
            archiveTarget
              ? `Archive ${archiveTarget.name}? Existing inventory history will remain available.`
              : ""
          }
          confirmLabel="Archive product"
          busy={busy}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      </div>
    </main>
  );
}

export default function ProductsPage() {
  return (
    <ProtectedContent>
      <ProductManager />
    </ProtectedContent>
  );
}
