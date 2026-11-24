"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../auth/session-provider";

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

function money(currency: string, amount: string) {
  return `${currency} ${amount}`;
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export function InvoicesPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<CurrencySummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organization) {
      setRows([]);
      setSummary([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      if (currency.trim())
        params.set("currency", currency.trim().toUpperCase());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const [result, totals] = await Promise.all([
        authenticatedRequest<PageResult>(`${endpoint}?${params}`),
        authenticatedRequest<CurrencySummary[]>(`${endpoint}/summary`),
      ]);
      setRows(result.data);
      setTotal(result.total);
      setSummary(totals);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Invoices could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    authenticatedRequest,
    currency,
    from,
    organization,
    page,
    query,
    status,
    to,
  ]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES · FINANCE</p>
          <h1>Invoices</h1>
          <p>Issue customer invoices and track what has been collected.</p>
        </div>
        <Link className="button button-primary" href="/invoices/new">
          Create invoice
        </Link>
      </header>

      {!organization && (
        <section className="catalog-empty">
          <h2>Choose a workspace first</h2>
          <p>Invoices belong to the active organization.</p>
        </section>
      )}
      {summary.length > 0 && (
        <section className="report-summary-grid" aria-label="Invoice balances">
          {summary.map((item) => (
            <article className="report-summary-card" key={item.currency}>
              <p>{item.currency} · invoiced</p>
              <strong>{money(item.currency, item.invoiced)}</strong>
              <div className="report-summary-detail">
                <span>Collected</span>
                <b>{money(item.currency, item.collected)}</b>
              </div>
              <div className="report-summary-detail">
                <span>Outstanding</span>
                <b>{money(item.currency, item.outstanding)}</b>
              </div>
              <div className="report-summary-detail">
                <span>Overdue</span>
                <b>{money(item.currency, item.overdue)}</b>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="catalog-panel">
        <div className="catalog-toolbar">
          <label className="catalog-search">
            Search invoices
            <input
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Invoice, customer, or order"
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
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
              <option value="VOID">Void</option>
            </select>
          </label>
          <label>
            Currency
            <input
              aria-label="Invoice currency"
              maxLength={3}
              pattern="[A-Za-z]{3}"
              value={currency}
              onChange={(event) => {
                setPage(1);
                setCurrency(event.target.value);
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
                setPage(1);
                setFrom(event.target.value);
              }}
            />
          </label>
          <label>
            Issue date to
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setPage(1);
                setTo(event.target.value);
              }}
            />
          </label>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <p className="catalog-loading">Loading invoices…</p>
        ) : rows.length === 0 ? (
          <div className="catalog-empty">
            <h2>No invoices found</h2>
            <p>
              Create an invoice from a confirmed sales order when you are ready
              to bill a customer.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Sales order</th>
                  <th>Issue date</th>
                  <th>Due date</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/invoices/${invoice.id}`}>
                        {invoice.invoiceNumber ?? "Draft"}
                      </Link>
                    </td>
                    <td>{invoice.customer.name}</td>
                    <td>{invoice.salesOrder.number}</td>
                    <td>{date(invoice.issueDate)}</td>
                    <td>{date(invoice.dueDate)}</td>
                    <td>{money(invoice.currency, invoice.totalAmount)}</td>
                    <td>{money(invoice.currency, invoice.amountPaid)}</td>
                    <td>
                      {money(invoice.currency, invoice.outstandingAmount)}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${invoice.isOverdue ? "status-warning" : ""}`}
                      >
                        {invoice.isOverdue ? "OVERDUE" : invoice.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="table-action"
                        href={`/invoices/${invoice.id}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <div className="catalog-pagination">
            <span>
              {total} invoices · page {page}
            </span>
            <div>
              <button
                className="button button-secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                className="button button-secondary"
                disabled={page * 20 >= total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
