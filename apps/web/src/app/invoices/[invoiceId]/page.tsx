"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";

type Payment = {
  id: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  paymentReference: string | null;
  notes: string | null;
  dueDate: string | null;
  reversal: { reason: string; createdAt: string } | null;
};
type Invoice = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  paymentStatus: string;
  currency: string;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  isOverdue: boolean;
  customer: { name: string; email: string | null; phone: string | null };
  customerSnapshot: Record<string, string | null> | null;
  businessSnapshot: { name?: string } | null;
  salesOrder: { id: string; number: string };
  lines: {
    id: string;
    salesOrderLineId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    unitSnapshot: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxRateSnapshot: string;
    taxRateId: string | null;
    taxAmount: string;
    lineTotal: string;
  }[];
  allocations: { id: string; amount: string; payment: Payment }[];
};
type TaxRate = { id: string; name: string; rate: string; isActive: boolean };
type AuditEvent = {
  id: string;
  action: string;
  occurredAt: string;
  actor: { email: string };
};
const root = "/organizations/current/sales";
const methods = ["CASH", "BANK_TRANSFER", "POS", "CARD", "CHEQUE", "OTHER"];
const today = new Date().toISOString().slice(0, 10);
function isZero(value: string) {
  return !/[1-9]/.test(value.replaceAll(".", ""));
}

export default function InvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const { organization, authenticatedRequest, authenticatedDownload } =
    useSession();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [draftDiscounts, setDraftDiscounts] = useState<Record<string, string>>(
    {},
  );
  const [draftTaxRates, setDraftTaxRates] = useState<Record<string, string>>(
    {},
  );
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentNotes, setPaymentNotes] = useState("");
  const paymentKey = useRef("");
  const canManage = ["OWNER", "ADMIN", "FINANCE"].includes(
    organization?.role ?? "",
  );

  const load = useCallback(async () => {
    if (!organization || !params.invoiceId) return;
    setLoading(true);
    try {
      const [result, events] = await Promise.all([
        authenticatedRequest<Invoice>(`${root}/invoices/${params.invoiceId}`),
        authenticatedRequest<AuditEvent[]>(
          `${root}/invoices/${params.invoiceId}/audit`,
        ),
      ]);
      setInvoice(result);
      setAudit(events);
      setDraftDueDate(result.dueDate?.slice(0, 10) ?? "");
      setDraftNotes(result.notes ?? "");
      setDraftDiscounts(
        Object.fromEntries(
          result.lines.map((line) => [
            line.salesOrderLineId,
            line.discountAmount,
          ]),
        ),
      );
      setDraftTaxRates(
        Object.fromEntries(
          result.lines.map((line) => [
            line.salesOrderLineId,
            line.taxRateId ?? "",
          ]),
        ),
      );
      if (result.status === "DRAFT") {
        const rates = await authenticatedRequest<TaxRate[]>(
          `${root}/tax-rates`,
        );
        setTaxRates(rates.filter((rate) => rate.isActive));
      }
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Invoice could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, params.invoiceId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function issue() {
    if (
      !invoice ||
      !window.confirm(
        "Issue this invoice? Its financial details will become immutable.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${root}/invoices/${invoice.id}/issue`,
        {},
        "POST",
        { "Idempotency-Key": `invoice-issue:${invoice.id}` },
      );
      setNotice("Invoice issued.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Invoice could not be issued.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!invoice) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${root}/invoices/${invoice.id}`,
        {
          salesOrderId: invoice.salesOrder.id,
          dueDate: draftDueDate || undefined,
          notes: draftNotes.trim() || undefined,
          lines: invoice.lines.map((line) => ({
            salesOrderLineId: line.salesOrderLineId,
            discountAmount: draftDiscounts[line.salesOrderLineId] || "0",
            taxRateId: draftTaxRates[line.salesOrderLineId] || undefined,
          })),
        },
        "PATCH",
      );
      setNotice("Draft invoice updated.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice() {
    if (!invoice) return;
    const reason = window
      .prompt("Enter the reason for voiding this unpaid invoice:")
      ?.trim();
    if (!reason) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${root}/invoices/${invoice.id}/void`,
        { reason },
        "POST",
        { "Idempotency-Key": `invoice-void:${invoice.id}:${reason}` },
      );
      setNotice("Invoice voided.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Invoice could not be voided.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!invoice) return;
    setBusy(true);
    setError("");
    try {
      if (!paymentKey.current) paymentKey.current = crypto.randomUUID();
      await authenticatedRequest(
        `${root}/payments`,
        {
          invoiceId: invoice.id,
          amount,
          method,
          paymentReference: reference || undefined,
          paymentDate,
          notes: paymentNotes || undefined,
        },
        "POST",
        { "Idempotency-Key": paymentKey.current },
      );
      paymentKey.current = "";
      setPaymentOpen(false);
      setAmount("");
      setReference("");
      setPaymentNotes("");
      setNotice("Payment recorded.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reverse(payment: Payment) {
    if (!invoice || payment.reversal) return;
    const reason = window
      .prompt("Enter the reason for reversing this payment:")
      ?.trim();
    if (!reason) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${root}/payments/${payment.id}/reverse`,
        { reason },
        "POST",
        { "Idempotency-Key": `payment-reversal:${payment.id}:${reason}` },
      );
      setNotice("Payment reversal recorded.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be reversed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!invoice) return;
    try {
      const blob = await authenticatedDownload(
        `${root}/invoices/${invoice.id}/pdf`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(invoice.invoiceNumber ?? "invoice").toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Invoice PDF could not be downloaded.",
      );
    }
  }

  if (loading)
    return (
      <main className="page-content">
        <p className="catalog-loading">Loading invoice…</p>
      </main>
    );
  if (!invoice)
    return (
      <main className="page-content">
        <div className="error-banner" role="alert">
          {error || "Invoice not found."}
        </div>
        <Link href="/invoices">Back to invoices</Link>
      </main>
    );
  const canPay =
    invoice.status === "ISSUED" && !isZero(invoice.outstandingAmount);
  const canVoid = invoice.status === "ISSUED" && isZero(invoice.amountPaid);
  const customer = invoice.customerSnapshot ?? {};

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            SALES · FINANCE · {invoice.salesOrder.number}
          </p>
          <h1>{invoice.invoiceNumber ?? "Draft invoice"}</h1>
          <p>
            {invoice.customer.name} · {invoice.currency} ·{" "}
            {invoice.paymentStatus}
          </p>
        </div>
        <div className="page-heading-actions">
          <Link className="button button-secondary" href="/invoices">
            Back
          </Link>
          {invoice.status !== "DRAFT" && (
            <button className="button button-secondary" onClick={downloadPdf}>
              Download PDF
            </button>
          )}
          {invoice.status !== "DRAFT" && (
            <button
              className="button button-secondary"
              onClick={() => window.print()}
            >
              Print
            </button>
          )}
          {canManage && invoice.status === "DRAFT" && (
            <button
              disabled={busy}
              className="button button-primary"
              onClick={issue}
            >
              Issue invoice
            </button>
          )}
          {canManage && canPay && (
            <button
              disabled={busy}
              className="button button-primary"
              onClick={() => setPaymentOpen(true)}
            >
              Record payment
            </button>
          )}
          {canManage && canVoid && (
            <button
              disabled={busy}
              className="button button-secondary"
              onClick={voidInvoice}
            >
              Void invoice
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      <div className="invoice-detail-grid">
        <section className="catalog-panel">
          <h2>Customer</h2>
          <strong>{String(customer.name ?? invoice.customer.name)}</strong>
          <p>{String(customer.email ?? invoice.customer.email ?? "")}</p>
          <p>{String(customer.phone ?? invoice.customer.phone ?? "")}</p>
          <p>
            {[
              customer.billingAddressLine1,
              customer.billingAddressLine2,
              customer.billingCity,
              customer.billingRegion,
              customer.billingPostalCode,
              customer.billingCountryCode,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </section>
        <section className="catalog-panel">
          <h2>Invoice details</h2>
          <p>
            Business <strong>{invoice.businessSnapshot?.name ?? "—"}</strong>
          </p>
          <p>
            Sales order{" "}
            <Link href={`/sales-orders/${invoice.salesOrder.id}`}>
              {invoice.salesOrder.number}
            </Link>
          </p>
          <p>
            Issue date{" "}
            <strong>
              {invoice.issueDate
                ? new Date(invoice.issueDate).toLocaleDateString()
                : "Draft"}
            </strong>
          </p>
          <p>
            Due date{" "}
            <strong>
              {invoice.dueDate
                ? new Date(invoice.dueDate).toLocaleDateString()
                : "—"}
            </strong>
          </p>
          <p>
            Status{" "}
            <span className="status-pill">
              {invoice.isOverdue ? "OVERDUE" : invoice.paymentStatus}
            </span>
          </p>
        </section>
      </div>
      <section className="catalog-panel">
        <h2>Items</h2>
        {canManage && invoice.status === "DRAFT" && (
          <form onSubmit={saveDraft} className="invoice-draft-editor">
            <label>
              Due date
              <input
                type="date"
                value={draftDueDate}
                onChange={(event) => setDraftDueDate(event.target.value)}
              />
            </label>
            <label>
              Notes
              <textarea
                value={draftNotes}
                maxLength={1000}
                onChange={(event) => setDraftNotes(event.target.value)}
              />
            </label>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Discount</th>
                    <th>Tax rate</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        {line.productNameSnapshot} · {line.quantity}
                      </td>
                      <td>
                        <input
                          aria-label={`Discount for ${line.productNameSnapshot}`}
                          inputMode="decimal"
                          value={draftDiscounts[line.salesOrderLineId] ?? "0"}
                          onChange={(event) =>
                            setDraftDiscounts((current) => ({
                              ...current,
                              [line.salesOrderLineId]: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Tax rate for ${line.productNameSnapshot}`}
                          value={draftTaxRates[line.salesOrderLineId] ?? ""}
                          onChange={(event) =>
                            setDraftTaxRates((current) => ({
                              ...current,
                              [line.salesOrderLineId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">No tax</option>
                          {taxRates.map((rate) => (
                            <option key={rate.id} value={rate.id}>
                              {rate.name} ({rate.rate}%)
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="button button-secondary" disabled={busy}>
              Save draft changes
            </button>
          </form>
        )}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Discount</th>
                <th>Tax</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.productNameSnapshot}</strong>
                    <small>{line.skuSnapshot}</small>
                  </td>
                  <td>
                    {line.quantity} {line.unitSnapshot}
                  </td>
                  <td>
                    {line.unitPrice} {invoice.currency}
                  </td>
                  <td>
                    {line.discountAmount} {invoice.currency}
                  </td>
                  <td>
                    {line.taxRateSnapshot}% · {line.taxAmount}{" "}
                    {invoice.currency}
                  </td>
                  <td>
                    {line.lineTotal} {invoice.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice-totals">
          <p>
            Subtotal{" "}
            <strong>
              {invoice.subtotal} {invoice.currency}
            </strong>
          </p>
          <p>
            Discount{" "}
            <strong>
              {invoice.discountAmount} {invoice.currency}
            </strong>
          </p>
          <p>
            Tax{" "}
            <strong>
              {invoice.taxAmount} {invoice.currency}
            </strong>
          </p>
          <p>
            Total{" "}
            <strong>
              {invoice.totalAmount} {invoice.currency}
            </strong>
          </p>
          <p>
            Paid{" "}
            <strong>
              {invoice.amountPaid} {invoice.currency}
            </strong>
          </p>
          <p>
            Outstanding{" "}
            <strong>
              {invoice.outstandingAmount} {invoice.currency}
            </strong>
          </p>
        </div>
        {invoice.notes && <p>Notes: {invoice.notes}</p>}
      </section>
      <section className="catalog-panel">
        <h2>Payment history</h2>
        {invoice.allocations.length === 0 ? (
          <p>No payments recorded.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoice.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>
                      {new Date(
                        allocation.payment.paymentDate,
                      ).toLocaleDateString()}
                    </td>
                    <td>{allocation.payment.paymentMethod}</td>
                    <td>{allocation.payment.paymentReference ?? "—"}</td>
                    <td>
                      {allocation.amount} {invoice.currency}
                    </td>
                    <td>
                      {allocation.payment.reversal
                        ? `Reversed: ${allocation.payment.reversal.reason}`
                        : "Posted"}
                    </td>
                    <td>
                      {canManage && !allocation.payment.reversal && (
                        <button
                          className="table-action"
                          disabled={busy}
                          onClick={() => reverse(allocation.payment)}
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="catalog-panel">
        <h2>Audit history</h2>
        {audit.length === 0 ? (
          <p>No audit events recorded.</p>
        ) : (
          <ol>
            {audit.map((event) => (
              <li key={event.id}>
                {event.action} · {new Date(event.occurredAt).toLocaleString()} ·{" "}
                {event.actor.email}
              </li>
            ))}
          </ol>
        )}
      </section>
      {paymentOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaymentOpen(false);
          }}
        >
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <h2 id="payment-title">Record customer payment</h2>
            <p>
              Outstanding balance:{" "}
              <strong>
                {invoice.outstandingAmount} {invoice.currency}
              </strong>
            </p>
            <form onSubmit={recordPayment}>
              <label>
                Amount
                <input
                  required
                  inputMode="decimal"
                  pattern="(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?"
                  value={amount}
                  onChange={(event) => {
                    paymentKey.current = "";
                    setAmount(event.target.value);
                  }}
                />
              </label>
              <label>
                Method
                <select
                  value={method}
                  onChange={(event) => {
                    paymentKey.current = "";
                    setMethod(event.target.value);
                  }}
                >
                  {methods.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment date
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(event) => {
                    paymentKey.current = "";
                    setPaymentDate(event.target.value);
                  }}
                />
              </label>
              <label>
                Reference
                <input
                  maxLength={100}
                  value={reference}
                  onChange={(event) => {
                    paymentKey.current = "";
                    setReference(event.target.value);
                  }}
                />
              </label>
              <label>
                Notes
                <textarea
                  maxLength={1000}
                  value={paymentNotes}
                  onChange={(event) => {
                    paymentKey.current = "";
                    setPaymentNotes(event.target.value);
                  }}
                />
              </label>
              <div className="form-actions">
                <button className="button button-primary" disabled={busy}>
                  {busy ? "Recording…" : "Record payment"}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPaymentOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
