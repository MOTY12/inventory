"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "../auth/session-provider";

type View = "summary" | "movements" | "valuation" | "low-stock";
type Page<T> = { data: T[]; total: number; page: number; page_size: number };
type ProductOption = { id: string; name: string; sku: string };
type CategoryOption = { id: string; name: string };
type WarehouseOption = { id: string; name: string; code: string };
type Summary = {
  as_of: string;
  historical: boolean;
  totals: {
    products: number;
    stocked_products_with_balance: number;
    skus: number;
    on_hand: string;
    reserved: string;
    available: string;
    uncosted_quantity: string;
    current_low_stock_products: number;
    inventory_value_by_currency: {
      cost_currency: string | null;
      inventory_value: string;
    }[];
  };
  by_warehouse: {
    warehouse_id: string;
    warehouse_name: string;
    warehouse_code: string;
    on_hand: string;
    reserved: string;
    available: string;
  }[];
  by_category: {
    category_id: string | null;
    category_name: string | null;
    on_hand: string;
    reserved: string;
    available: string;
  }[];
  data: ReportRow[];
  total: number;
  page: number;
  page_size: number;
};
type ReportRow = {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  base_unit: string;
  on_hand: string;
  reserved: string;
  available: string;
  average_cost: string | null;
  cost_currency: string | null;
  inventory_value: string | null;
};
type Movement = {
  id: string;
  occurredAt: string;
  movementType: string;
  quantityIn: string;
  quantityOut: string;
  quantityDelta: string;
  documentType: string;
  documentId: string;
  documentLineId: string | null;
  costPerBaseUnit: string | null;
  costCurrency: string | null;
  product: ProductOption & { baseUnit: { code: string } };
  warehouse: WarehouseOption;
  actor: string;
  relatedTransaction: {
    documentType: string;
    documentId: string;
    documentLineId: string | null;
  };
};
type LowStockAlert = {
  id: string;
  status: string;
  availableQuantity: string;
  minimumQuantity: string;
  targetQuantity: string;
  suggestedQuantity: string;
  lastEvaluatedAt: string;
  product: ProductOption & { baseUnit: { code: string } };
  warehouse: WarehouseOption;
};

const tabs: { id: View; label: string }[] = [
  { id: "summary", label: "Inventory summary" },
  { id: "movements", label: "Stock movements" },
  { id: "valuation", label: "Valuation" },
  { id: "low-stock", label: "Low stock" },
];

function currencyValue(currency: string | null, value: string | null) {
  if (value === null) return "Uncosted";
  return `${currency ?? "Unspecified currency"} ${value}`;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ReportsPage() {
  const { organization, authenticatedRequest } = useSession();
  const [view, setView] = useState<View>("summary");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [asOf, setAsOf] = useState("");
  const [movementType, setMovementType] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<
    Summary | Page<Movement> | Page<LowStockAlert> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    void Promise.all([
      authenticatedRequest<Page<WarehouseOption>>(
        "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
      ),
      authenticatedRequest<Page<CategoryOption>>(
        "/organizations/current/catalog/categories?page=1&page_size=100&status=ACTIVE",
      ),
      authenticatedRequest<Page<ProductOption>>(
        "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
      ),
    ])
      .then(([w, c, p]) => {
        if (cancelled) return;
        setWarehouses(w.data);
        setCategories(c.data);
        setProducts(p.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load report filters.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedRequest, organization]);

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
        page_size: "25",
      });
      if (warehouseId) params.set("warehouse_id", warehouseId);
      if (categoryId) params.set("category_id", categoryId);
      if (productId) params.set("product_id", productId);
      if (query.trim()) params.set("q", query.trim());
      if (view === "movements") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (movementType) params.set("movement_type", movementType);
      } else if ((view === "summary" || view === "valuation") && asOf) {
        params.set("as_of", asOf);
      }
      const endpoint =
        view === "summary"
          ? "inventory-summary"
          : view === "movements"
            ? "movements"
            : view === "valuation"
              ? "valuation"
              : "low-stock";
      setResult(
        await authenticatedRequest<
          Summary | Page<Movement> | Page<LowStockAlert>
        >(`/organizations/current/reports/${endpoint}?${params}`),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load this report.",
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [
    asOf,
    authenticatedRequest,
    categoryId,
    from,
    organization,
    page,
    productId,
    query,
    to,
    view,
    warehouseId,
    movementType,
  ]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const total = useMemo(() => result?.total ?? 0, [result]);
  const pages = Math.max(1, Math.ceil(total / 25));
  function changeView(next: View) {
    setView(next);
    setPage(1);
    setResult(null);
  }
  function resetPage(action: () => void) {
    action();
    setPage(1);
  }

  return (
    <main className="page-content reports-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">OPERATIONS INSIGHTS</p>
          <h1>Reports</h1>
          <p className="page-description">
            Ledger-backed inventory, movement and replenishment reports for{" "}
            {organization?.name ?? "your workspace"}.
          </p>
        </div>
        <span className="date-chip">Live data · tenant scoped</span>
      </header>

      <nav className="report-tabs" aria-label="Inventory reports">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={view === tab.id}
            className={view === tab.id ? "report-tab active" : "report-tab"}
            onClick={() => changeView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="report-filters" aria-label="Report filters">
        <label>
          Warehouse
          <select
            value={warehouseId}
            onChange={(event) =>
              resetPage(() => setWarehouseId(event.target.value))
            }
          >
            <option value="">All accessible warehouses</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} · {warehouse.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            value={categoryId}
            onChange={(event) =>
              resetPage(() => setCategoryId(event.target.value))
            }
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            value={productId}
            onChange={(event) =>
              resetPage(() => setProductId(event.target.value))
            }
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.sku}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            value={query}
            onChange={(event) => resetPage(() => setQuery(event.target.value))}
            placeholder="Product, SKU, warehouse"
          />
        </label>
        {view === "movements" ? (
          <>
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(event) =>
                  resetPage(() => setFrom(event.target.value))
                }
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={to}
                onChange={(event) => resetPage(() => setTo(event.target.value))}
              />
            </label>
            <label>
              Movement type
              <select
                value={movementType}
                onChange={(event) =>
                  resetPage(() => setMovementType(event.target.value))
                }
              >
                <option value="">All movement types</option>
                {[
                  "OPENING_BALANCE",
                  "RECEIPT",
                  "SALE_FULFILLMENT",
                  "TRANSFER_OUT",
                  "TRANSFER_IN",
                  "ADJUSTMENT",
                  "REVERSAL",
                ].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {view === "summary" || view === "valuation" ? (
          <label>
            Valuation cutoff (UTC)
            <input
              type="date"
              value={asOf}
              onChange={(event) => resetPage(() => setAsOf(event.target.value))}
            />
          </label>
        ) : null}
      </section>

      {error ? (
        <div className="report-message error" role="alert">
          <strong>Report unavailable</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {loading ? (
        <div className="report-message" role="status">
          Loading report data…
        </div>
      ) : null}
      {!loading && !error && result ? (
        <>
          {view === "summary" && "totals" in result ? (
            <SummaryView data={result} />
          ) : null}
          {view === "valuation" && "totals" in result ? (
            <ValuationView data={result} />
          ) : null}
          {view === "movements" && "data" in result && !("totals" in result) ? (
            <MovementView data={result as Page<Movement>} />
          ) : null}
          {view === "low-stock" && "data" in result && !("totals" in result) ? (
            <LowStockView data={result as Page<LowStockAlert>} />
          ) : null}
          {total > 25 ? (
            <div className="report-pagination">
              <span>
                Showing page {page} of {pages} · {total.toLocaleString()} rows
              </span>
              <div>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {!loading && !error && result && total === 0 && view !== "summary" ? (
        <div className="report-empty">
          <strong>No matching records</strong>
          <span>
            Try widening the filters, or check back after inventory activity.
          </span>
        </div>
      ) : null}
    </main>
  );
}

function SummaryView({ data }: { data: Summary }) {
  const valueText = data.totals.inventory_value_by_currency.length
    ? data.totals.inventory_value_by_currency
        .map((value) =>
          currencyValue(value.cost_currency, value.inventory_value),
        )
        .join(" · ")
    : "—";
  return (
    <>
      <div className="report-cutoff">
        {data.historical
          ? "Historical ledger snapshot"
          : "Current balance projection"}{" "}
        · {displayDate(data.as_of)}
      </div>
      <section className="report-kpis" aria-label="Inventory totals">
        <Metric
          label="Products"
          value={data.totals.products.toLocaleString()}
          note={`${data.totals.stocked_products_with_balance.toLocaleString()} product/warehouse balances`}
        />
        <Metric
          label="On hand"
          value={data.totals.on_hand}
          note="Physical quantity across selected warehouses"
        />
        <Metric
          label="Reserved"
          value={data.totals.reserved}
          note="Confirmed, unfulfilled orders"
        />
        <Metric
          label="Available"
          value={data.totals.available}
          note="On hand less reserved"
        />
        <Metric
          label="Inventory value"
          value={valueText}
          note={
            data.totals.uncosted_quantity === "0"
              ? "Weighted-average cost"
              : `${data.totals.uncosted_quantity} units have no cost snapshot`
          }
        />
        <Metric
          label="Low-stock products"
          value={data.totals.current_low_stock_products.toLocaleString()}
          note="Current open reorder alerts in this scope"
        />
      </section>
      <div className="report-breakdowns">
        <Breakdown
          title="Stock by warehouse"
          rows={data.by_warehouse.map((row) => ({
            label: `${row.warehouse_name} · ${row.warehouse_code}`,
            value: row.on_hand,
            detail: `${row.available} available`,
          }))}
        />
        <Breakdown
          title="Stock by category"
          rows={data.by_category.map((row) => ({
            label: row.category_name ?? "Uncategorized",
            value: row.on_hand,
            detail: `${row.available} available`,
          }))}
        />
      </div>
      <section className="panel report-panel">
        <div className="report-section-heading">
          <div>
            <p className="eyebrow">STOCK POSITION</p>
            <h2>Product and warehouse summary</h2>
          </div>
          <span>{data.total.toLocaleString()} rows</span>
        </div>
        {data.data.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Warehouse</th>
                  <th>On hand</th>
                  <th>Reserved</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={`${row.product_id}:${row.warehouse_id}`}>
                    <td>
                      <Link href={`/products/${row.product_id}`}>
                        {row.product_name}
                      </Link>
                    </td>
                    <td>{row.sku}</td>
                    <td>{row.category_name ?? "—"}</td>
                    <td>{row.warehouse_name}</td>
                    <td>
                      {row.on_hand} {row.base_unit}
                    </td>
                    <td>{row.reserved}</td>
                    <td>{row.available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="report-empty">
            <strong>No stock balances to show</strong>
            <span>
              Post an opening balance or receive stock to populate this report.
            </span>
            <Link href="/imports">Import products or opening balances</Link>
          </div>
        )}
      </section>
    </>
  );
}

function ValuationView({ data }: { data: Summary }) {
  return (
    <>
      <section className="report-kpis valuation-kpi">
        <Metric
          label="Valuation cutoff"
          value={displayDate(data.as_of)}
          note={
            data.historical
              ? "Replayed from immutable movements"
              : "Current average-cost projection"
          }
        />
        {data.totals.inventory_value_by_currency.map((entry) => (
          <Metric
            key={entry.cost_currency ?? "none"}
            label={`Total value · ${entry.cost_currency ?? "Uncosted"}`}
            value={entry.inventory_value}
            note="On-hand quantity × weighted-average unit cost"
          />
        ))}
        <Metric
          label="Uncosted stock"
          value={data.totals.uncosted_quantity}
          note="Quantity without a usable cost snapshot"
        />
      </section>
      <section className="panel report-panel">
        <div className="report-section-heading">
          <div>
            <p className="eyebrow">WEIGHTED AVERAGE COST</p>
            <h2>Valuation by product and warehouse</h2>
          </div>
        </div>
        {data.data.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Warehouse</th>
                  <th>On hand</th>
                  <th>Average unit cost</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={`${row.product_id}:${row.warehouse_id}`}>
                    <td>
                      <Link href={`/products/${row.product_id}`}>
                        {row.product_name}
                      </Link>
                    </td>
                    <td>{row.sku}</td>
                    <td>{row.warehouse_name}</td>
                    <td>
                      {row.on_hand} {row.base_unit}
                    </td>
                    <td>
                      {currencyValue(row.cost_currency, row.average_cost)}
                    </td>
                    <td>
                      {currencyValue(row.cost_currency, row.inventory_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="report-empty">
            <strong>No valuation rows</strong>
            <span>Choose another cutoff or post inventory activity.</span>
          </div>
        )}
      </section>
    </>
  );
}

function MovementView({ data }: { data: Page<Movement> }) {
  return (
    <section className="panel report-panel">
      <div className="report-section-heading">
        <div>
          <p className="eyebrow">IMMUTABLE STOCK LEDGER</p>
          <h2>Stock movement history</h2>
        </div>
        <span>{data.total.toLocaleString()} movements</span>
      </div>
      {data.data.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date & time</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Type</th>
                <th>In</th>
                <th>Out</th>
                <th>Reference</th>
                <th>Actor</th>
                <th>Unit cost</th>
                <th>Movement ID</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row) => (
                <tr key={row.id}>
                  <td>{displayDate(row.occurredAt)}</td>
                  <td>
                    <Link href={`/products/${row.product.id}`}>
                      {row.product.name}
                    </Link>
                    <small>{row.product.sku}</small>
                  </td>
                  <td>{row.warehouse.name}</td>
                  <td>{row.movementType}</td>
                  <td>
                    {row.quantityIn === "0"
                      ? "—"
                      : `${row.quantityIn} ${row.product.baseUnit.code}`}
                  </td>
                  <td>
                    {row.quantityOut === "0"
                      ? "—"
                      : `${row.quantityOut} ${row.product.baseUnit.code}`}
                  </td>
                  <td title={row.documentId}>
                    {row.documentType}
                    <small>{row.documentId.slice(0, 8)}</small>
                  </td>
                  <td>{row.actor}</td>
                  <td>
                    {currencyValue(row.costCurrency, row.costPerBaseUnit)}
                  </td>
                  <td>
                    <code>{row.id.slice(0, 10)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="report-empty">
          <strong>No movements match these filters</strong>
          <span>The ledger only shows posted stock changes.</span>
        </div>
      )}
    </section>
  );
}

function LowStockView({ data }: { data: Page<LowStockAlert> }) {
  return (
    <section className="panel report-panel">
      <div className="report-section-heading">
        <div>
          <p className="eyebrow">REPLENISHMENT QUEUE</p>
          <h2>Low-stock alerts</h2>
        </div>
        <Link href="/inventory/reorder-rules">Manage reorder rules</Link>
      </div>
      {data.data.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Available</th>
                <th>Minimum</th>
                <th>Target</th>
                <th>Suggested reorder</th>
                <th>Alert</th>
                <th>Last evaluated</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/products/${row.product.id}`}>
                      {row.product.name}
                    </Link>
                    <small>{row.product.sku}</small>
                  </td>
                  <td>{row.warehouse.name}</td>
                  <td>
                    {row.availableQuantity} {row.product.baseUnit.code}
                  </td>
                  <td>{row.minimumQuantity}</td>
                  <td>{row.targetQuantity}</td>
                  <td>
                    <strong>{row.suggestedQuantity}</strong>{" "}
                    {row.product.baseUnit.code}
                  </td>
                  <td>
                    <span className="report-status">{row.status}</span>
                  </td>
                  <td>{displayDate(row.lastEvaluatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="report-empty">
          <strong>No low-stock alerts</strong>
          <span>
            Alerts appear here when configured reorder rules fall below their
            minimum.
          </span>
          <Link href="/inventory/reorder-rules">Configure reorder rules</Link>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; detail: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value)));
  return (
    <section className="panel report-breakdown">
      <h2>{title}</h2>
      {rows.length ? (
        rows.slice(0, 8).map((row) => (
          <div className="breakdown-row" key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>
                {row.value} · {row.detail}
              </span>
            </div>
            <div className="breakdown-track">
              <i
                style={{
                  width: `${Math.min(100, Math.max(2, (Number(row.value) / max) * 100))}%`,
                }}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="report-hint">No matching stock balances.</p>
      )}
    </section>
  );
}
