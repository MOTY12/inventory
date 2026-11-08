"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

type Row = {
  id: string;
  number: string;
  status: string;
  orderDate: string;
  currency: string;
  total: string;
  customer: { name: string };
  warehouse: { name: string };
  lines: { orderedQuantity: string; fulfilledQuantity: string }[];
};
type Page<T> = { data: T[]; total: number; page: number; page_size: number };
const endpoint = "/organizations/current/sales/orders";
function quantityUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole || "0") * BigInt(1_000_000) +
    BigInt((fraction + "000000").slice(0, 6))
  );
}

export default function SalesOrdersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!organization) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      const result = await authenticatedRequest<Page<Row>>(
        `${endpoint}?${params}`,
      );
      setRows(result.data);
      setTotal(result.total);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sales orders could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, [authenticatedRequest, organization, page, query, status]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES</p>
          <h1>Sales orders</h1>
          <p>Track customer orders and the stock reserved for fulfillment.</p>
        </div>
        {canWrite && (
          <Link className="button button-primary" href="/sales-orders/new">
            Create sales order
          </Link>
        )}
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <div className="table-toolbar">
          <label>
            Search orders
            <input
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Order number"
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
              <option>DRAFT</option>
              <option>CONFIRMED</option>
              <option>PARTIALLY_FULFILLED</option>
              <option>FULFILLED</option>
              <option>CANCELLED</option>
            </select>
          </label>
        </div>
        {busy ? (
          <p className="muted">Loading sales orders…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <h2>No sales orders yet</h2>
            <p>Create an order to reserve available stock for a customer.</p>
            {canWrite && (
              <Link href="/sales-orders/new" className="button button-primary">
                Create sales order
              </Link>
            )}
          </div>
        ) : (
          <div className="product-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Warehouse</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Fulfillment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const fulfilledLines = row.lines.filter(
                    (line) =>
                      quantityUnits(line.fulfilledQuantity) >=
                      quantityUnits(line.orderedQuantity),
                  ).length;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/sales-orders/${row.id}`}>
                          <strong>{row.number}</strong>
                        </Link>
                      </td>
                      <td>{row.customer.name}</td>
                      <td>{row.warehouse.name}</td>
                      <td>{new Date(row.orderDate).toLocaleDateString()}</td>
                      <td>
                        {row.currency} {row.total}
                      </td>
                      <td>
                        {fulfilledLines} / {row.lines.length} lines
                      </td>
                      <td>
                        <span className="status-badge">
                          {row.status.replaceAll("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination-row">
          <span>
            {total} order{total === 1 ? "" : "s"}
          </span>
          <div>
            <button
              className="button button-secondary"
              disabled={page <= 1 || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="button button-secondary"
              disabled={page * 20 >= total || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
