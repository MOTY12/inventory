"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";
import { TablePagination } from "../../components/ui/table-pagination";
import { TableToolbar } from "../../components/ui/table-toolbar";
import { formatDecimal } from "../../features/procurement/decimal";

type Order = {
  id: string;
  number: string;
  status: string;
  currency: string;
  subtotal: string;
  supplier: { name: string };
  warehouse: { name: string };
  _count: { lines: number; receipts: number };
};
type Page<T> = { data: T[]; total: number; page: number; page_size: number };
const base = "/organizations/current/procurement";

export default function PurchaseOrdersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const columns: DataTableColumn<Order>[] = [
    {
      key: "number",
      header: "Purchase order",
      render: (order) => (
        <Link className="ui-primary-cell" href={`/purchase-orders/${order.id}`}>
          {order.number}
          <small>
            {order._count.lines} lines · {order._count.receipts} receipts
          </small>
        </Link>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (order) => order.supplier.name,
    },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (order) => order.warehouse.name,
    },
    {
      key: "status",
      header: "Status",
      render: (order) => <StatusBadge status={order.status} />,
    },
    {
      key: "subtotal",
      header: "Subtotal",
      align: "right",
      render: (order) => `${order.currency} ${formatDecimal(order.subtotal)}`,
    },
    {
      key: "action",
      header: "Action",
      render: (order) => (
        <Link className="ui-quiet-button" href={`/purchase-orders/${order.id}`}>
          View order
        </Link>
      ),
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
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (status) params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const result = await authenticatedRequest<Page<Order>>(
        `${base}/purchase-orders?${params}`,
      );
      setOrders(result.data);
      setTotalOrders(result.total);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load purchasing data.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, page, query, status]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="PURCHASING"
        title="Purchase orders"
        description="Manage supplier purchases and incoming inventory."
        action={
          <div className="dashboard-actions">
            <Link className="button button-secondary" href="/suppliers">
              Suppliers
            </Link>
            {canWrite ? (
              <Link
                className="button button-primary"
                href="/purchase-orders/new"
              >
                ＋ New purchase order
              </Link>
            ) : null}
          </div>
        }
      />
      {error && (
        <div className="catalog-error" role="alert">
          {error}
          <button
            className="catalog-text-button"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <Link className="primary-button" href="/organizations">
            Manage organizations
          </Link>
        </section>
      ) : (
        <>
          <section className="catalog-panel">
            <div className="catalog-panel-heading">
              <div>
                <span className="catalog-eyebrow">ORDER REGISTER</span>
                <h2>Recent purchasing</h2>
              </div>
            </div>
            <TableToolbar
              query={query}
              onQueryChange={(value) => {
                setPage(1);
                setQuery(value);
              }}
              queryLabel="Search purchase orders"
              queryPlaceholder="PO number or supplier"
            >
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
                  {[
                    "DRAFT",
                    "SUBMITTED",
                    "PARTIALLY_RECEIVED",
                    "RECEIVED",
                    "CANCELLED",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </TableToolbar>
            <DataTable
              columns={columns}
              rows={orders}
              rowKey={(order) => order.id}
              loading={loading}
              emptyTitle={
                query || status
                  ? "No matching purchase orders"
                  : "No purchase orders yet"
              }
              emptyDescription={
                query || status
                  ? "Change the search or status filter to see other orders."
                  : "New drafts will appear here."
              }
            />
            <TablePagination
              page={page}
              pageSize={20}
              total={totalOrders}
              loading={loading}
              onPageChange={setPage}
              onPageSizeChange={() => setPage(1)}
            />
          </section>
        </>
      )}
    </main>
  );
}
