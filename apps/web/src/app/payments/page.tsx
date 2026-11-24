"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

type Payment = {
  id: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentDate: string;
  customer: { name: string };
  allocations: { invoice: { id: string; invoiceNumber: string | null } }[];
  reversal: { reason: string } | null;
};
type Result = {
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
  const [total, setTotal] = useState(0);
  const [method, setMethod] = useState("");
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "25",
      });
      if (method) params.set("method", method);
      if (currency.trim())
        params.set("currency", currency.trim().toUpperCase());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const result = await authenticatedRequest<Result>(
        `${endpoint}?${params}`,
      );
      setRows(result.data);
      setTotal(result.total);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payments could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, currency, from, method, organization, page, to]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES · FINANCE</p>
          <h1>Payments</h1>
          <p>Review manual customer receipts and their invoice allocations.</p>
        </div>
        <Link className="button button-secondary" href="/invoices">
          Invoices
        </Link>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="catalog-panel">
        <div className="catalog-toolbar">
          <label>
            Method
            <select
              value={method}
              onChange={(event) => {
                setPage(1);
                setMethod(event.target.value);
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
            Date from
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
            Date to
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
        {loading ? (
          <p className="catalog-loading">Loading payments…</p>
        ) : rows.length === 0 ? (
          <div className="catalog-empty">
            <h2>No payments recorded</h2>
            <p>
              Payments appear here after they are allocated to an issued
              invoice.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {new Date(payment.paymentDate).toLocaleDateString()}
                    </td>
                    <td>{payment.customer.name}</td>
                    <td>
                      {payment.allocations.map(({ invoice }) => (
                        <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
                          {invoice.invoiceNumber ?? "Invoice"}
                        </Link>
                      ))}
                    </td>
                    <td>{payment.paymentMethod.replaceAll("_", " ")}</td>
                    <td>{payment.paymentReference ?? "—"}</td>
                    <td>
                      {payment.currency} {payment.amount}
                    </td>
                    <td>
                      {payment.reversal
                        ? `REVERSED · ${payment.reversal.reason}`
                        : "POSTED"}
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
              {total} payments · page {page}
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
                disabled={page * 25 >= total}
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
