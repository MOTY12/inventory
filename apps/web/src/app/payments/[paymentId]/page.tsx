"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";
import { DocumentHeader } from "../../../components/documents/document-header";
import { DocumentLayout } from "../../../components/documents/document-layout";
import { DocumentInformation } from "../../../components/documents/document-information";
import { DocumentSection } from "../../../components/documents/document-section";
import { Drawer } from "../../../components/ui/drawer";
import { StatusBadge } from "../../../components/ui/status-badge";

type Payment = {
  id: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentDate: string;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  allocations: {
    amount: string;
    invoice: {
      id: string;
      invoiceNumber: string | null;
      status: string;
      currency: string;
    };
  }[];
  reversal: {
    id: string;
    amount: string;
    reason: string;
    createdAt: string;
  } | null;
};
const root = "/organizations/current/sales/payments";

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { organization, authenticatedRequest } = useSession();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const reversalCommand = useRef<{ reason: string; key: string } | null>(null);
  const orgId = organization?.id;
  const canManage = ["OWNER", "ADMIN", "FINANCE"].includes(
    organization?.role ?? "",
  );
  const load = useCallback(async () => {
    const request = ++requestId.current;
    if (!orgId || !paymentId) {
      setPayment(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await authenticatedRequest<Payment>(
        `${root}/${paymentId}`,
      );
      if (requestId.current === request) {
        setPayment(result);
        setError("");
      }
    } catch (cause) {
      if (requestId.current === request)
        setError(
          cause instanceof Error
            ? cause.message
            : "Payment details could not be loaded.",
        );
    } finally {
      if (requestId.current === request) setLoading(false);
    }
  }, [authenticatedRequest, orgId, paymentId]);
  useEffect(() => {
    void Promise.resolve().then(load);
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  async function reverse() {
    if (!payment || !reason.trim() || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const normalizedReason = reason.trim();
    if (reversalCommand.current?.reason !== normalizedReason) {
      reversalCommand.current = {
        reason: normalizedReason,
        key: crypto.randomUUID(),
      };
    }
    try {
      await authenticatedRequest(
        `${root}/${payment.id}/reverse`,
        { reason: normalizedReason },
        "POST",
        { "Idempotency-Key": reversalCommand.current.key },
      );
      reversalCommand.current = null;
      setReversalOpen(false);
      setReason("");
      setNotice("Payment reversal recorded.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Payment reversal failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ui-page">
      <DocumentHeader
        eyebrow="SALES · FINANCE"
        title="Payment"
        reference={payment?.paymentReference || paymentId?.slice(0, 8)}
        description="Recorded customer receipt and its invoice allocation history."
        breadcrumbs={[
          { label: "Payments", href: "/payments" },
          { label: "Payment details" },
        ]}
        status={payment?.reversal ? "REVERSED" : payment ? "POSTED" : undefined}
        action={
          payment && canManage && !payment.reversal ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setReversalOpen(true)}
            >
              Reverse payment
            </button>
          ) : undefined
        }
      />
      {loading ? (
        <p role="status">Loading payment…</p>
      ) : error && !payment ? (
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
      ) : payment ? (
        <>
          {error ? (
            <div className="error-banner" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? (
            <p role="status" className="success-banner">
              {notice}
            </p>
          ) : null}
          <DocumentLayout
            aside={
              <DocumentSection title="Amount">
                <p className="document-total">
                  {payment.currency} {payment.amount}
                </p>
                <p>
                  {payment.reversal ? "Reversed in full" : "Recorded payment"}
                </p>
              </DocumentSection>
            }
          >
            <DocumentInformation
              title="Payment information"
              fields={[
                {
                  label: "Customer",
                  value: (
                    <Link href={`/customers/${payment.customer.id}`}>
                      {payment.customer.name}
                    </Link>
                  ),
                },
                { label: "Email", value: payment.customer.email },
                { label: "Phone", value: payment.customer.phone },
                {
                  label: "Payment date",
                  value: new Date(payment.paymentDate).toLocaleDateString(),
                },
                {
                  label: "Method",
                  value: payment.paymentMethod
                    .replaceAll("_", " ")
                    .toLowerCase(),
                },
                { label: "Reference", value: payment.paymentReference },
                { label: "Currency", value: payment.currency },
                { label: "Notes", value: payment.notes },
              ]}
            />
            <DocumentSection
              title="Invoice allocations"
              description="This payment is linked to these organization-scoped invoices."
            >
              {payment.allocations.map((allocation) => (
                <p key={allocation.invoice.id}>
                  <Link href={`/invoices/${allocation.invoice.id}`}>
                    {allocation.invoice.invoiceNumber ?? "Invoice draft"}
                  </Link>{" "}
                  · {allocation.invoice.currency} {allocation.amount} ·{" "}
                  <StatusBadge status={allocation.invoice.status} />
                </p>
              ))}
            </DocumentSection>
            {payment.reversal ? (
              <DocumentInformation
                title="Reversal history"
                fields={[
                  { label: "Status", value: <StatusBadge status="REVERSED" /> },
                  {
                    label: "Amount",
                    value: `${payment.currency} ${payment.reversal.amount}`,
                  },
                  { label: "Reason", value: payment.reversal.reason },
                  {
                    label: "Recorded",
                    value: new Date(
                      payment.reversal.createdAt,
                    ).toLocaleString(),
                  },
                ]}
              />
            ) : null}
          </DocumentLayout>
        </>
      ) : (
        <p>Payment not found.</p>
      )}
      <Drawer
        open={reversalOpen}
        title="Reverse payment"
        description="This records a reversal in Stockroom and restores invoice outstanding balance. It does not move money through a bank or payment provider."
        onClose={() => {
          if (!saving) setReversalOpen(false);
        }}
      >
        <div className="form-stack">
          <p>
            Original amount:{" "}
            <strong>
              {payment?.currency} {payment?.amount}
            </strong>
          </p>
          <label>
            Reason
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="ui-dialog-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={saving}
              onClick={() => setReversalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button ui-confirm-danger"
              type="button"
              disabled={saving || !reason.trim()}
              onClick={() => void reverse()}
            >
              {saving ? "Recording…" : "Record reversal"}
            </button>
          </div>
        </div>
      </Drawer>
    </main>
  );
}
