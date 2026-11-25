"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/ui/data-table";
import { PageHeader } from "../../../components/ui/page-header";
import { StatusBadge } from "../../../components/ui/status-badge";
import { Drawer } from "../../../components/ui/drawer";

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
  const [formOpen, setFormOpen] = useState(false);
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
  const canWrite = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "BUYER",
    "WAREHOUSE_CLERK",
  ].includes(organization?.role ?? "");
  const ruleColumns: DataTableColumn<Rule>[] = [
    {
      key: "product",
      header: "Product",
      render: (r) => (
        <>
          {r.product.name}
          <small>{r.product.sku}</small>
        </>
      ),
    },
    { key: "warehouse", header: "Warehouse", render: (r) => r.warehouse.name },
    {
      key: "available",
      header: "Available",
      align: "right",
      render: (r) => `${r.availableQuantity} ${r.product.baseUnit.code}`,
    },
    {
      key: "minimum",
      header: "Reorder level",
      align: "right",
      render: (r) => `${r.minimumQuantity} ${r.product.baseUnit.code}`,
    },
    {
      key: "target",
      header: "Target quantity",
      align: "right",
      render: (r) => `${r.targetQuantity} ${r.product.baseUnit.code}`,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "alert",
      header: "Alert",
      render: (r) => <StatusBadge status={r.alert?.status ?? "ACTIVE"} />,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (r: Rule) => (
              <div className="ui-row-actions">
                <button
                  className="ui-quiet-button"
                  onClick={() => beginEdit(r)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="ui-quiet-button"
                  disabled={busy}
                  onClick={() => void setStatus(r)}
                  type="button"
                >
                  {r.status === "ACTIVE" ? "Pause" : "Enable"}
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];
  const alertColumns: DataTableColumn<Alert>[] = [
    {
      key: "product",
      header: "Product",
      render: (a) => (
        <Link className="ui-primary-cell" href={`/products/${a.product.id}`}>
          {a.product.name}
          <small>{a.product.sku}</small>
        </Link>
      ),
    },
    { key: "warehouse", header: "Warehouse", render: (a) => a.warehouse.name },
    {
      key: "onHand",
      header: "On hand",
      align: "right",
      render: (a) => `${a.onHandQuantity} ${a.product.baseUnit.code}`,
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right",
      render: (a) => a.reservedQuantity,
    },
    {
      key: "available",
      header: "Available",
      align: "right",
      render: (a) => a.availableQuantity,
    },
    {
      key: "incoming",
      header: "Incoming",
      align: "right",
      render: (a) => a.incomingQuantity,
    },
    {
      key: "minimum",
      header: "Reorder level",
      align: "right",
      render: (a) => a.minimumQuantity,
    },
    {
      key: "suggested",
      header: "Suggested",
      align: "right",
      render: (a) => a.suggestedQuantity,
    },
    {
      key: "status",
      header: "Status",
      render: (a) => <StatusBadge status={a.status} />,
    },
  ];

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
    setFormOpen(true);
    setProductId(rule.productId);
    setWarehouseId(rule.warehouseId);
    setMinimum(rule.minimumQuantity);
    setTarget(rule.targetQuantity);
  }
  function clearForm() {
    setEditing(null);
    setFormOpen(false);
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
      setNotice(
        rule.status === "ACTIVE"
          ? "Reorder rule paused."
          : "Reorder rule enabled.",
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
    <main className="ui-page inventory-page">
      <PageHeader
        eyebrow="STOCK CONTROL"
        title={alertsOnly ? "Low stock" : "Reorder rules"}
        description={
          alertsOnly
            ? "Identify products that need replenishment based on available stock."
            : "Configure stock thresholds to identify products that need replenishment."
        }
        action={
          <nav className="ui-page-actions">
            <Link
              className="catalog-secondary-link"
              href="/inventory/reorder-rules"
            >
              Reorder rules
            </Link>
            <Link
              className="catalog-secondary-link"
              href="/inventory/low-stock"
            >
              Low stock
            </Link>
            {alertsOnly && canWrite && (
              <button
                className="button-secondary"
                disabled={busy}
                onClick={evaluate}
                type="button"
              >
                Evaluate now
              </button>
            )}
            {!alertsOnly && canWrite && (
              <button
                className="button button-primary"
                onClick={() => {
                  clearForm();
                  setFormOpen(true);
                }}
                type="button"
              >
                Add reorder rule
              </button>
            )}
          </nav>
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
      {alertsOnly ? (
        <section className="panel">
          <div className="products-toolbar ui-filter-toolbar">
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
            <p role="status">Loading low-stock alerts…</p>
          ) : alerts.length === 0 ? (
            <p className="empty-state">
              No open low-stock alerts. Rules are evaluated every five minutes.
            </p>
          ) : (
            <DataTable
              columns={alertColumns}
              rows={alerts}
              rowKey={(a) => a.id}
              loading={loading}
              emptyTitle="No low-stock alerts"
              emptyDescription="All tracked products are above their configured thresholds."
            />
          )}
          <p className="form-hint">
            Available = on hand − reserved. Incoming quantities are excluded; no
            purchase order is created automatically.
          </p>
          <nav className="ui-pagination" aria-label="Low-stock pagination">
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
          </nav>
        </section>
      ) : (
        <>
          {canWrite && formOpen && (
            <Drawer
              open
              onClose={clearForm}
              title={editing ? "Edit reorder rule" : "Add reorder rule"}
              description="Set a threshold and replenishment target for one warehouse."
            >
              <form
                className="ui-drawer-form ui-drawer-form-grid"
                onSubmit={save}
              >
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
                <div className="ui-drawer-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={clearForm}
                  >
                    Cancel
                  </button>
                  <button className="button button-primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : editing
                        ? "Save changes"
                        : "Create rule"}
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
            </Drawer>
          )}
          <section className="panel">
            <div className="products-toolbar ui-filter-toolbar">
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
            <DataTable
              columns={ruleColumns}
              rows={rules}
              rowKey={(r) => r.id}
              loading={loading}
              emptyTitle="No reorder rules yet"
              emptyDescription="Add a warehouse-specific rule to track available stock."
            />
            <nav className="ui-pagination" aria-label="Reorder rule pagination">
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
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
