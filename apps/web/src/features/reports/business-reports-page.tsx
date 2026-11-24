"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../auth/session-provider";

type ReportView =
  | "sales"
  | "sales-products"
  | "sales-customers"
  | "purchases"
  | "purchase-products"
  | "suppliers"
  | "receivables";
type Summary = Record<string, unknown>;

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return JSON.stringify(value);
}

export function BusinessReportsPage() {
  const { organization } = useSession();
  return <BusinessReportsContent key={organization?.id ?? "none"} />;
}

function BusinessReportsContent() {
  const { organization, authenticatedRequest } = useSession();
  const [view, setView] = useState<ReportView>("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const [warehouse, setWarehouse] = useState("");
  const [currency, setCurrency] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [warehouses, setWarehouses] = useState<
    { id: string; name: string; code: string }[]
  >([]);
  const [result, setResult] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    if (!organization)
      return () => {
        active = false;
      };
    void authenticatedRequest<{
      data: { id: string; name: string; code: string }[];
    }>("/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE")
      .then((response) => {
        if (active) setWarehouses(response.data);
      })
      .catch(() => {
        if (active) setWarehouses([]);
      });
    return () => {
      active = false;
    };
  }, [authenticatedRequest, organization]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!organization) {
      if (version === requestVersion.current) {
        setResult(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (warehouse) params.set("warehouse_id", warehouse);
    if (currency) params.set("currency", currency);
    if (search) params.set("q", search);
    params.set("page", String(page));
    params.set("page_size", "25");
    const path =
      view === "sales" ||
      view === "sales-products" ||
      view === "sales-customers"
        ? "sales/summary"
        : view === "purchases" ||
            view === "purchase-products" ||
            view === "suppliers"
          ? "purchases/summary"
          : "receivables/aging";
    const detailPath: Partial<Record<ReportView, string>> = {
      "sales-products": "sales/products",
      "sales-customers": "sales/customers",
      "purchase-products": "purchases/products",
      suppliers: "purchases/suppliers",
    };
    try {
      const response = detailPath[view]
        ? await authenticatedRequest<Summary>(
            `/organizations/current/reports/${detailPath[view]}?${params}`,
          )
        : await authenticatedRequest<Summary>(
            `/organizations/current/reports/${path}?${params}`,
          );
      let trendResponse: Summary | null = null;
      if (view === "sales" || view === "purchases") {
        const trendParams = new URLSearchParams(params);
        trendParams.set("period", period);
        const trendPath =
          view === "sales" ? "sales/trends" : "purchases/trends";
        trendResponse = await authenticatedRequest<Summary>(
          `/organizations/current/reports/${trendPath}?${trendParams}`,
        );
      }
      if (version === requestVersion.current) {
        setResult(response);
        setTrend(trendResponse);
      }
    } catch (cause) {
      if (version === requestVersion.current) {
        setResult(null);
        setError(
          cause instanceof Error ? cause.message : "Could not load the report.",
        );
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [
    authenticatedRequest,
    currency,
    from,
    organization,
    page,
    period,
    search,
    to,
    view,
    warehouse,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const sections: [string, unknown][] =
    view === "sales-products" ||
    view === "sales-customers" ||
    view === "purchase-products" ||
    view === "suppliers"
      ? [
          [
            view === "sales-products"
              ? "Product sales performance by unit and currency"
              : view === "sales-customers"
                ? "Customer performance · current balances"
                : view === "purchase-products"
                  ? "Product purchasing performance by unit and currency"
                  : "Supplier purchasing performance · not accounts payable",
            result?.data,
          ],
        ]
      : view === "sales"
        ? [
            ["Order value by currency", result?.order_value],
            ["Issued invoice value", result?.invoice_value],
            ["Effective collections and reversals", result?.collections],
            ["Current receivables", result?.receivables],
            ["Sales order statuses", result?.order_status],
            ["Sales order trend", trend?.orders],
            ["Fulfilled quantities by line unit", trend?.fulfilled],
            ["Issued invoice trend", trend?.invoices],
            ["Collections trend", trend?.collections],
          ]
        : view === "purchases"
          ? [
              ["Purchase order value", result?.order_value],
              ["Received purchase value", result?.received_value],
              ["Outstanding receiving", result?.outstanding],
              ["Purchase order statuses", result?.order_status],
              ["Purchase order trend", trend?.orders],
              ["Goods received trend", trend?.received],
            ]
          : [["Receivables aging by currency", result?.data]];

  return (
    <main className="page-content reports-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">BUSINESS PERFORMANCE</p>
          <h1>Sales &amp; purchasing reports</h1>
          <p className="page-description">
            Operational order, invoice, collection, receiving and receivable
            metrics for {organization?.name ?? "your workspace"}.
          </p>
        </div>
        <span className="date-chip">Tenant and warehouse scoped</span>
      </header>
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <p>
            Business reports follow your active organization and warehouse
            permissions.
          </p>
        </section>
      ) : !["OWNER", "ADMIN", "FINANCE", "READ_ONLY", "MEMBER"].includes(
          organization.role ?? "",
        ) ? (
        <section className="catalog-empty">
          <h2>Financial report access is restricted</h2>
          <p>
            Your current role does not include finance:read. Ask an organization
            owner to review your access.
          </p>
        </section>
      ) : (
        <>
          <nav className="report-tabs" aria-label="Business reports">
            {(
              [
                "sales",
                "sales-products",
                "sales-customers",
                "purchases",
                "purchase-products",
                "suppliers",
                "receivables",
              ] as ReportView[]
            ).map((item) => (
              <button
                className={view === item ? "report-tab active" : "report-tab"}
                aria-pressed={view === item}
                key={item}
                onClick={() => setView(item)}
              >
                {
                  {
                    sales: "Sales overview",
                    "sales-products": "Product sales",
                    "sales-customers": "Customers",
                    purchases: "Purchasing overview",
                    "purchase-products": "Product purchasing",
                    suppliers: "Suppliers",
                    receivables: "Receivables aging",
                  }[item]
                }
              </button>
            ))}
          </nav>
          <section
            className="report-filters"
            aria-label="Business report filters"
          >
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <label>
              Warehouse
              <select
                value={warehouse}
                onChange={(event) => setWarehouse(event.target.value)}
              >
                <option value="">All accessible warehouses</option>
                {warehouses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency
              <input
                maxLength={3}
                placeholder="All currencies"
                value={currency}
                onChange={(event) => {
                  setCurrency(event.target.value.toUpperCase());
                  setPage(1);
                }}
              />
            </label>
            {(
              [
                "sales-products",
                "sales-customers",
                "purchase-products",
                "suppliers",
              ] as ReportView[]
            ).includes(view) && (
              <label>
                Search
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
            )}
            {(view === "sales" || view === "purchases") && (
              <label>
                Trend interval
                <select
                  value={period}
                  onChange={(event) =>
                    setPeriod(event.target.value as "day" | "week" | "month")
                  }
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </label>
            )}
            <button
              className="catalog-secondary-link"
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </button>
            {(
              [
                "sales-products",
                "sales-customers",
                "purchase-products",
                "suppliers",
              ] as ReportView[]
            ).includes(view) && (
              <div className="report-pagination" aria-label="Report pages">
                <button
                  className="catalog-secondary-link"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  className="catalog-secondary-link"
                  disabled={rows(result?.data).length < 25 || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </section>
          {loading ? (
            <section className="catalog-empty" aria-live="polite">
              <h2>Loading report…</h2>
            </section>
          ) : error ? (
            <section className="catalog-empty" role="alert">
              <h2>Report unavailable</h2>
              <p>{error}</p>
              <button
                className="catalog-secondary-link"
                onClick={() => void load()}
              >
                Try again
              </button>
            </section>
          ) : (
            <section className="report-grid" aria-label="Report results">
              {sections.map(([title, value]) => (
                <article className="report-card" key={String(title)}>
                  <h2>{title}</h2>
                  {rows(value).length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {Object.keys(rows(value)[0]!).map((key) => (
                              <th scope="col" key={key}>
                                {key.replaceAll("_", " ")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows(value).map((row, index) => (
                            <tr key={index}>
                              {Object.entries(row).map(([key, cell]) => (
                                <td key={key}>{formatValue(cell)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="page-description">
                      No records for the selected filters.
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}
          {view === "purchases" && (
            <p className="page-description">
              Outstanding order value represents goods not yet received; it is
              not supplier accounts payable.
            </p>
          )}
          {view === "receivables" && (
            <p className="page-description">
              Aging is current-state only. Invoices without due dates are listed
              separately; issued invoices exclude drafts and voids.
            </p>
          )}
        </>
      )}
    </main>
  );
}
