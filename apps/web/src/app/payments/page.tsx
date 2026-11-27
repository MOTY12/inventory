"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../features/auth/session-provider";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable } from "../../components/ui/data-table";
import { TablePagination } from "../../components/ui/table-pagination";
import { StatusBadge } from "../../components/ui/status-badge";
import { EntitySelector } from "../../components/documents/entity-selector";

type Payment = {
  id: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentDate: string;
  customer: { id: string; name: string };
  allocations: { invoice: { id: string; invoiceNumber: string | null } }[];
  reversal: { reason: string } | null;
};
type PageResult = {
  data: Payment[];
  total: number;
  page: number;
  pageSize: number;
};
const endpoint = "/organizations/current/sales/payments";

export default function PaymentsPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Payment[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [method, setMethod] = useState("");
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const orgId = organization?.id;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!orgId) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (customer) params.set("customerId", customer.id);
    if (method) params.set("method", method);
    if (/^[A-Za-z]{3}$/.test(currency.trim()))
      params.set("currency", currency.trim().toUpperCase());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const result = await authenticatedRequest<PageResult>(
        `${endpoint}?${params}`,
      );
      if (requestId.current !== id) return;
      setRows(result.data);
      setTotal(result.total);
      setError("");
    } catch (cause) {
      if (requestId.current !== id) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Payments could not be loaded.",
      );
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [
    authenticatedRequest,
    currency,
    customer,
    from,
    method,
    orgId,
    page,
    pageSize,
    to,
  ]);

  useEffect(() => {
    void Promise.resolve().then(load);
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  const clear = () => {
    setCustomer(null);
    setMethod("");
    setCurrency("");
    setFrom("");
    setTo("");
    setPage(1);
  };
  const columns = [
    {
      key: "reference",
      header: "Payment reference",
      render: (payment: Payment) => (
        <Link href={`/payments/${payment.id}`}>
          {payment.paymentReference || `Payment ${payment.id.slice(0, 8)}`}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (payment: Payment) => payment.customer.name,
    },
    {
      key: "invoice",
      header: "Invoices",
      render: (payment: Payment) =>
        payment.allocations.length
          ? payment.allocations.map(({ invoice }) => (
              <span key={invoice.id}>
                <Link href={`/invoices/${invoice.id}`}>
                  {invoice.invoiceNumber ?? "Draft"}
                </Link>{" "}
              </span>
            ))
          : "—",
    },
    {
      key: "date",
      header: "Payment date",
      render: (payment: Payment) =>
        new Date(payment.paymentDate).toLocaleDateString(),
    },
    {
      key: "method",
      header: "Method",
      render: (payment: Payment) =>
        payment.paymentMethod.replaceAll("_", " ").toLowerCase(),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      render: (payment: Payment) => `${payment.currency} ${payment.amount}`,
    },
    {
      key: "status",
      header: "Status",
      render: (payment: Payment) => (
        <span title={payment.reversal?.reason}>
          <StatusBadge status={payment.reversal ? "REVERSED" : "POSTED"} />
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (payment: Payment) => (
        <Link className="table-action" href={`/payments/${payment.id}`}>
          Open
        </Link>
      ),
    },
  ];

  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="SALES · FINANCE"
        title="Payments"
        description="Review customer receipts, invoice allocations, and reversals."
        action={
          <Link className="button button-secondary" href="/invoices">
            Invoices
          </Link>
        }
      />
      {!orgId ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <p>Payments belong to the active organization.</p>
        </section>
      ) : (
        <section className="ui-list-panel" aria-label="Payment register">
          <div className="ui-filter-toolbar">
            <EntitySelector
              endpoint="/organizations/current/sales/customers"
              label="Customer"
              value={customer}
              onSelect={(value) => {
                setCustomer(value);
                setPage(1);
              }}
              searchHint="Search customers"
            />
            <label>
              Method
              <select
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All methods</option>
                {[
                  ["CASH", "Cash"],
                  ["BANK_TRANSFER", "Bank transfer"],
                  ["POS", "POS"],
                  ["CARD", "Card"],
                  ["CHEQUE", "Cheque"],
                  ["OTHER", "Other"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency
              <input
                aria-label="Payment currency"
                maxLength={3}
                value={currency}
                onChange={(event) => {
                  setCurrency(event.target.value);
                  setPage(1);
                }}
                placeholder="NGN"
              />
            </label>
            <label>
              Date from
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button className="ui-quiet-button" type="button" onClick={clear}>
              Clear filters
            </button>
          </div>
          {error ? (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="catalog-text-button"
                type="button"
                onClick={() => void load()}
              >
                Retry
              </button>
            </div>
          ) : null}
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(payment) => payment.id}
            loading={loading}
            emptyTitle="No payments recorded"
            emptyDescription="Receipts appear here after they are allocated to issued invoices."
          />
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </section>
      )}
    </main>
  );
}
