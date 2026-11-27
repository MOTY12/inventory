"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "../auth/session-provider";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable } from "../../components/ui/data-table";
import { TableToolbar } from "../../components/ui/table-toolbar";
import { TablePagination } from "../../components/ui/table-pagination";
import { StatusBadge } from "../../components/ui/status-badge";
import { PaymentStatusBadge } from "../../components/finance/payment-status-badge";
import {
  EntitySelector,
  type SelectableEntity,
} from "../../components/documents/entity-selector";

type Invoice = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  paymentStatus: string;
  currency: string;
  issueDate: string | null;
  dueDate: string | null;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  isOverdue: boolean;
  customer: { name: string };
  salesOrder: { number: string };
};
type PageResult = {
  data: Invoice[];
  total: number;
  page: number;
  pageSize: number;
};
type CurrencySummary = {
  currency: string;
  invoiced: string;
  collected: string;
  outstanding: string;
  overdue: string;
};
const endpoint = "/organizations/current/sales/invoices";
const currencyAmount = (currency: string, amount: string) =>
  `${currency} ${amount}`;
const displayDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "—";

export function InvoicesPage() {
  const { organization, authenticatedRequest } = useSession();
  const organizationIdRef = useRef(organization?.id ?? "");
  const requestVersion = useRef(0);
  useLayoutEffect(() => {
    organizationIdRef.current = organization?.id ?? "";
  }, [organization?.id]);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<CurrencySummary[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<SelectableEntity | null>(null);
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canCreate = ["OWNER", "ADMIN", "FINANCE"].includes(
    organization?.role ?? "",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!organization) {
      setRows([]);
      setSummary([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const organizationId = organization.id;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (search) params.set("q", search);
      if (status) params.set("status", status);
      if (customer) params.set("customerId", customer.id);
      if (/^[A-Za-z]{3}$/.test(currency.trim()))
        params.set("currency", currency.trim().toUpperCase());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const [result, totals] = await Promise.all([
        authenticatedRequest<PageResult>(`${endpoint}?${params}`),
        authenticatedRequest<CurrencySummary[]>(`${endpoint}/summary`),
      ]);
      if (
        version !== requestVersion.current ||
        organizationIdRef.current !== organizationId
      )
        return;
      setRows(result.data);
      setTotal(result.total);
      setSummary(totals);
    } catch (cause) {
      if (
        version !== requestVersion.current ||
        organizationIdRef.current !== organizationId
      )
        return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Invoices could not be loaded.",
      );
    } finally {
      if (
        version === requestVersion.current &&
        organizationIdRef.current === organizationId
      )
        setLoading(false);
    }
  }, [
    authenticatedRequest,
    currency,
    customer,
    from,
    organization,
    page,
    pageSize,
    search,
    status,
    to,
  ]);
  useEffect(() => {
    void Promise.resolve().then(load);
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  function resetFilters() {
    setQuery("");
    setSearch("");
    setCustomer(null);
    setStatus("");
    setCurrency("");
    setFrom("");
    setTo("");
    setPage(1);
  }
  const columns = [
    {
      key: "invoice",
      header: "Invoice",
      render: (invoice: Invoice) => (
        <Link href={`/invoices/${invoice.id}`}>
          {invoice.invoiceNumber ?? "Draft"}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (invoice: Invoice) => invoice.customer.name,
    },
    {
      key: "salesOrder",
      header: "Sales order",
      render: (invoice: Invoice) => invoice.salesOrder.number,
    },
    {
      key: "issueDate",
      header: "Issue date",
      render: (invoice: Invoice) => displayDate(invoice.issueDate),
    },
    {
      key: "dueDate",
      header: "Due date",
      render: (invoice: Invoice) => displayDate(invoice.dueDate),
    },
    {
      key: "total",
      header: "Invoice total",
      align: "right" as const,
      render: (invoice: Invoice) =>
        currencyAmount(invoice.currency, invoice.totalAmount),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right" as const,
      render: (invoice: Invoice) =>
        currencyAmount(invoice.currency, invoice.amountPaid),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right" as const,
      render: (invoice: Invoice) =>
        currencyAmount(invoice.currency, invoice.outstandingAmount),
    },
    {
      key: "documentStatus",
      header: "Document status",
      render: (invoice: Invoice) => <StatusBadge status={invoice.status} />,
    },
    {
      key: "paymentStatus",
      header: "Payment status",
      render: (invoice: Invoice) => (
        <PaymentStatusBadge
          status={invoice.paymentStatus}
          overdue={invoice.isOverdue && invoice.status !== "VOID"}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (invoice: Invoice) => (
        <Link className="table-action" href={`/invoices/${invoice.id}`}>
          Open
        </Link>
      ),
    },
  ];

  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="SALES · FINANCE"
        title="Invoices"
        description="Review issued invoices, payment progress, and outstanding balances by currency."
        action={
          canCreate ? (
            <Link className="button button-primary" href="/invoices/new">
              Create invoice
            </Link>
          ) : undefined
        }
      />
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <p>Invoices belong to the active organization.</p>
        </section>
      ) : (
        <>
          {summary.length > 0 && (
            <section
              className="report-summary-grid"
              aria-label="Invoice balances"
            >
              {summary.map((item) => (
                <article className="report-summary-card" key={item.currency}>
                  <p>{item.currency} · invoiced</p>
                  <strong>
                    {currencyAmount(item.currency, item.invoiced)}
                  </strong>
                  <div className="report-summary-detail">
                    <span>Collected</span>
                    <b>{currencyAmount(item.currency, item.collected)}</b>
                  </div>
                  <div className="report-summary-detail">
                    <span>Outstanding</span>
                    <b>{currencyAmount(item.currency, item.outstanding)}</b>
                  </div>
                  <div className="report-summary-detail">
                    <span>Overdue</span>
                    <b>{currencyAmount(item.currency, item.overdue)}</b>
                  </div>
                </article>
              ))}
            </section>
          )}
          <section className="ui-list-panel" aria-label="Invoice register">
            <TableToolbar
              query={query}
              onQueryChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              queryLabel="Search invoices"
              queryPlaceholder="Invoice, customer, or sales order"
              onClear={resetFilters}
            >
              <label>
                Status
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ISSUED">Issued</option>
                  <option value="VOID">Void</option>
                </select>
              </label>
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
                Currency
                <input
                  aria-label="Invoice currency"
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
                Issue date from
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
                Issue date to
                <input
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </TableToolbar>
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
              rowKey={(invoice) => invoice.id}
              loading={loading}
              emptyTitle="No invoices found"
              emptyDescription="Create an invoice from an eligible sales order, or adjust your filters."
            />
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              loading={loading}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </section>
        </>
      )}
    </main>
  );
}
