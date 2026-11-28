"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";

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
  const columns: DataTableColumn<Row>[] = [
    {
      key: "number",
      header: "Sales order",
      render: (row) => (
        <Link className="ui-primary-cell" href={`/sales-orders/${row.id}`}>
          {row.number}
        </Link>
      ),
    },
    { key: "customer", header: "Customer", render: (row) => row.customer.name },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (row) => row.warehouse.name,
    },
    {
      key: "date",
      header: "Order date",
      render: (row) => new Date(row.orderDate).toLocaleDateString(),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => `${row.currency} ${row.total}`,
    },
    {
      key: "fulfillment",
      header: "Fulfillment",
      render: (row) => {
        const done = row.lines.filter(
          (line) =>
            quantityUnits(line.fulfilledQuantity) >=
            quantityUnits(line.orderedQuantity),
        ).length;
        return `${done} of ${row.lines.length} lines complete`;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="SALES"
        title="Sales orders"
        description="Manage customer orders and fulfillment."
        action={
          canWrite ? (
            <Link className="button button-primary" href="/sales-orders/new">
              New sales order
            </Link>
          ) : undefined
        }
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button
            className="button-link"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
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
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={busy}
          emptyTitle={
            query || status ? "No matching sales orders" : "No sales orders yet"
          }
          emptyDescription={
            query || status
              ? "Change the search or status filter to see other orders."
              : "Create an order to reserve available stock for a customer."
          }
        />
        <nav className="pagination-row" aria-label="Sales order pages">
          <span>
            {total} order{total === 1 ? "" : "s"}
          </span>
          <div>
            <button
              className="button button-secondary"
              disabled={page <= 1 || busy}
              type="button"
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="button button-secondary"
              disabled={page * 20 >= total || busy}
              type="button"
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      </section>
    </main>
  );
}
