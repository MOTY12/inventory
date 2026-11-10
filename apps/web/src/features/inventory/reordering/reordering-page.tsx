"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../../../features/auth/session-provider";

type Page<T> = {
  data: T[];
  total: number;
  summary?: { products: number; warehouses: number };
};
type Product = {
  id: string;
  name: string;
  sku: string;
  baseUnit: { code: string };
};
type Warehouse = { id: string; name: string; code: string };
type Rule = {
  id: string;
  productId: string;
  warehouseId: string;
  minimumQuantity: string;
  targetQuantity: string;
  availableQuantity: string;
  status: "ACTIVE" | "PAUSED";
  product: Product;
  warehouse: Warehouse;
  alert: { status: string } | null;
};
type Alert = {
  id: string;
  status: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  incomingQuantity: string;
  minimumQuantity: string;
  suggestedQuantity: string;
  product: Product;
  warehouse: Warehouse;
};
const base = "/organizations/current/inventory";

export function ReorderingPage({
  alertsOnly = false,
}: {
  alertsOnly?: boolean;
}) {
  const { organization, authenticatedRequest } = useSession();
  const [rules, setRules] = useState<Rule[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [minimum, setMinimum] = useState("");
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
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
      const q = new URLSearchParams({ page: String(page), page_size: "20" });
      if (query.trim()) q.set("q", query.trim());
      if (statusFilter && !alertsOnly) q.set("status", statusFilter);
      const alertQuery = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (query.trim()) alertQuery.set("q", query.trim());
      if (statusFilter && alertsOnly) alertQuery.set("status", statusFilter);
      const [r, a, p, w] = await Promise.all([
        authenticatedRequest<Page<Rule>>(`${base}/reorder-rules?${q}`),
        authenticatedRequest<Page<Alert>>(`${base}/low-stock?${alertQuery}`),
        authenticatedRequest<Page<Product>>(
          "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
        ),
        authenticatedRequest<Page<Warehouse>>(
          "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setRules(r.data);
      setAlerts(a.data);
      setTotal(alertsOnly ? a.total : r.total);
      setProducts(p.data);
      setWarehouses(w.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reorder data.");
    } finally {
      setLoading(false);
    }
  }, [
    alertsOnly,
    authenticatedRequest,
    organization,
    page,
    query,
    statusFilter,
  ]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function beginEdit(rule: Rule) {
    setEditing(rule);
    setProductId(rule.productId);
    setWarehouseId(rule.warehouseId);
    setMinimum(rule.minimumQuantity);
    setTarget(rule.targetQuantity);
  }
  function clearForm() {
    setEditing(null);
    setProductId("");
    setWarehouseId("");
    setMinimum("");
    setTarget("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editing)
        await authenticatedRequest(
          `${base}/reorder-rules/${editing.id}`,
          { minimumQuantity: minimum, targetQuantity: target },
          "PATCH",
        );
      else
        await authenticatedRequest(
          `${base}/reorder-rules`,
          {
            productId,
            warehouseId,
            minimumQuantity: minimum,
            targetQuantity: target,
          },
          "POST",
        );
      clearForm();
      setNotice(editing ? "Reorder rule updated." : "Reorder rule created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the rule.");
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(rule: Rule) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${base}/reorder-rules/${rule.id}`,
        { status: rule.status === "ACTIVE" ? "PAUSED" : "ACTIVE" },
        "PATCH",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update rule status.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function evaluate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authenticatedRequest<{
        evaluated: number;
        failed: number;
      }>(`${base}/reorder-rules/evaluate`, {}, "POST");
      setNotice(
        `Evaluated ${result.evaluated} rules${result.failed ? `; ${result.failed} failed and will retry` : ""}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="inventory-page">
      <header className="products-heading">
        <div>
          <p className="catalog-eyebrow">STOCK CONTROL</p>
          <h1>{alertsOnly ? "Low stock" : "Reorder rules"}</h1>
          <p>
            {alertsOnly
              ? "Review available stock against configured thresholds. Incoming purchase orders are excluded."
              : "Set warehouse-specific thresholds and replenishment targets."}
          </p>
        </div>
        <nav className="catalog-actions">
          <Link
            className="catalog-secondary-link"
            href="/inventory/reorder-rules"
          >
            Reorder rules
          </Link>
          <Link className="catalog-secondary-link" href="/inventory/low-stock">
            Low stock
          </Link>
          {alertsOnly && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={evaluate}
            >
              Evaluate now
            </button>
          )}
        </nav>
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
      {alertsOnly ? (
        <section className="panel">
          <div className="products-toolbar">
            <label>
              Search
              <input
                value={query}
                onChange={(e) => {
                  setPage(1);
                  setQuery(e.target.value);
                }}
                placeholder="Product or warehouse"
              />
            </label>
            <label>
              Alert status
              <select
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value);
                }}
              >
                <option value="">Open alerts</option>
                <option value="RESOLVED">Resolved alerts</option>
              </select>
            </label>
            <span>
              {total} {statusFilter === "RESOLVED" ? "resolved" : "open"} alert
              {total === 1 ? "" : "s"}
            </span>
          </div>
          {loading ? (
            <p>Loading low-stock alerts…</p>
          ) : alerts.length === 0 ? (
            <p className="empty-state">
              No open low-stock alerts. Rules are evaluated every five minutes.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Warehouse</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th>Incoming</th>
                    <th>Minimum</th>
                    <th>Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/products/${a.product.id}`}>
                          {a.product.name}
                        </Link>
                        <small>{a.product.sku}</small>
                      </td>
                      <td>{a.warehouse.name}</td>
                      <td>
                        {a.onHandQuantity} {a.product.baseUnit.code}
                      </td>
                      <td>{a.reservedQuantity}</td>
                      <td>{a.availableQuantity}</td>
                      <td>0</td>
                      <td>{a.minimumQuantity}</td>
                      <td>{a.suggestedQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="form-hint">
            Available = on hand − reserved. Incoming quantities are excluded; no
            purchase order is created automatically.
          </p>
          <div className="catalog-actions" aria-label="Low-stock pagination">
            <button
              className="button-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / 20))}
            </span>
            <button
              className="button-secondary"
              disabled={page >= Math.ceil(total / 20) || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </section>
      ) : (
        <>
          {canWrite && (
            <form className="panel form-grid" onSubmit={save}>
              <h2>{editing ? "Edit reorder rule" : "Create reorder rule"}</h2>
              {!editing && (
                <>
                  <label>
                    Product
                    <select
                      required
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.sku}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Warehouse
                    <select
                      required
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                    >
                      <option value="">Select warehouse</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} · {w.code}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label>
                Minimum available quantity
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                />
              </label>
              <label>
                Target available quantity
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <div className="catalog-actions">
                <button className="button-primary" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Create rule"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={clearForm}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
          <section className="panel">
            <div className="products-toolbar">
              <label>
                Search
                <input
                  value={query}
                  onChange={(e) => {
                    setPage(1);
                    setQuery(e.target.value);
                  }}
                  placeholder="Product or warehouse"
                />
              </label>
              <label>
                Rule status
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(1);
                    setStatusFilter(e.target.value);
                  }}
                >
                  <option value="">All rules</option>
                  <option value="ACTIVE">Enabled</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </label>
              <span>{total} rules</span>
            </div>
            {loading ? (
              <p>Loading reorder rules…</p>
            ) : rules.length === 0 ? (
              <p className="empty-state">
                No reorder rules yet. Create one to track a product’s available
                stock.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Warehouse</th>
                      <th>Available</th>
                      <th>Minimum</th>
                      <th>Target</th>
                      <th>Rule</th>
                      <th>Alert</th>
                      {canWrite && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.product.name}
                          <small>{r.product.sku}</small>
                        </td>
                        <td>{r.warehouse.name}</td>
                        <td>
                          {r.availableQuantity} {r.product.baseUnit.code}
                        </td>
                        <td>
                          {r.minimumQuantity} {r.product.baseUnit.code}
                        </td>
                        <td>{r.targetQuantity}</td>
                        <td>{r.status}</td>
                        <td>{r.alert?.status ?? "—"}</td>
                        {canWrite && (
                          <td>
                            <button
                              className="text-button"
                              onClick={() => beginEdit(r)}
                            >
                              Edit
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => setStatus(r)}
                            >
                              {r.status === "ACTIVE" ? "Pause" : "Enable"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div
              className="catalog-actions"
              aria-label="Reorder rule pagination"
            >
              <button
                className="button-secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / 20))}
              </span>
              <button
                className="button-secondary"
                disabled={page >= Math.ceil(total / 20) || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
