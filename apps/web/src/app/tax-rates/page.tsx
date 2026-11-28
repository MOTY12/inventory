"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable } from "../../components/ui/data-table";
import { StatusBadge } from "../../components/ui/status-badge";
import { Drawer } from "../../components/ui/drawer";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

type TaxRate = {
  id: string;
  name: string;
  code: string;
  rate: string;
  description: string | null;
  isActive: boolean;
};
const endpoint = "/organizations/current/sales/tax-rates";

export default function TaxRatesPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<TaxRate[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<TaxRate | null>(null);
  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      setRows(await authenticatedRequest<TaxRate[]>(endpoint));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tax rates could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function create(event: FormEvent): Promise<boolean> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        endpoint,
        {
          name,
          code: code.trim().toUpperCase(),
          rate,
          description: description || undefined,
        },
        "POST",
      );
      setName("");
      setCode("");
      setRate("");
      setDescription("");
      setNotice("Tax rate added. It will affect new drafts only.");
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tax rate could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function toggle(row: TaxRate): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${endpoint}/${row.id}`,
        { isActive: !row.isActive },
        "PATCH",
      );
      setNotice(
        "Tax rate status updated. Existing invoice snapshots are unchanged.",
      );
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tax rate could not be updated.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit(row: TaxRate): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${endpoint}/${row.id}`,
        {
          name: editName.trim(),
          code: editCode.trim().toUpperCase(),
          rate: editRate,
          description: editDescription.trim() || undefined,
        },
        "PATCH",
      );
      setEditingId("");
      setNotice("Tax rate updated. Existing invoice snapshots are unchanged.");
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tax rate could not be updated.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const columns = [
    {
      key: "name",
      header: "Tax name",
      render: (row: TaxRate) => (
        <>
          <strong>{row.name}</strong>
          <small className="table-secondary">{row.code}</small>
        </>
      ),
    },
    {
      key: "rate",
      header: "Rate",
      align: "right" as const,
      render: (row: TaxRate) => `${row.rate}%`,
    },
    {
      key: "description",
      header: "Description",
      render: (row: TaxRate) => row.description || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row: TaxRate) => (
        <StatusBadge status={row.isActive ? "ACTIVE" : "ARCHIVED"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: TaxRate) => (
        <>
          <button
            className="table-action"
            type="button"
            disabled={busy}
            onClick={() => {
              setEditingId(row.id);
              setEditName(row.name);
              setEditCode(row.code);
              setEditRate(row.rate);
              setEditDescription(row.description ?? "");
              setDrawerOpen(true);
            }}
          >
            Edit
          </button>
          <button
            className="table-action"
            type="button"
            disabled={busy}
            onClick={() => setStatusTarget(row)}
          >
            {row.isActive ? "Deactivate" : "Activate"}
          </button>
        </>
      ),
    },
  ];
  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    const row = rows.find((item) => item.id === editingId);
    if (row) void saveEdit(row).then((saved) => saved && setDrawerOpen(false));
    else void create(event).then((saved) => saved && setDrawerOpen(false));
  };
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="BUSINESS SETTINGS · FINANCE"
        title="Tax rates"
        description="Configure tax rates for new invoices. No statutory rates are preloaded."
        action={
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setEditingId("");
              setName("");
              setCode("");
              setRate("");
              setDescription("");
              setDrawerOpen(true);
            }}
          >
            Add tax rate
          </button>
        }
      />
      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="success-banner" role="status">
          {notice}
        </p>
      ) : null}
      <section className="ui-list-panel" aria-label="Configured tax rates">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No tax rates configured"
          emptyDescription="Add only the rates your organization has approved for operational use."
        />
      </section>
      <Drawer
        open={drawerOpen}
        title={editingId ? "Edit tax rate" : "Add tax rate"}
        description="Changes apply to new invoice drafts. Issued invoice tax snapshots stay unchanged."
        onClose={() => {
          if (!busy) {
            setDrawerOpen(false);
            setEditingId("");
          }
        }}
      >
        <form className="form-stack" onSubmit={submitForm}>
          <label>
            Name
            <input
              required
              maxLength={120}
              value={editingId ? editName : name}
              onChange={(event) =>
                editingId
                  ? setEditName(event.target.value)
                  : setName(event.target.value)
              }
            />
          </label>
          <label>
            Code
            <input
              required
              pattern="[A-Za-z0-9_-]{2,40}"
              maxLength={40}
              value={editingId ? editCode : code}
              onChange={(event) =>
                editingId
                  ? setEditCode(event.target.value)
                  : setCode(event.target.value)
              }
            />
          </label>
          <label>
            Rate (%)
            <input
              required
              inputMode="decimal"
              pattern="(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?"
              value={editingId ? editRate : rate}
              onChange={(event) =>
                editingId
                  ? setEditRate(event.target.value)
                  : setRate(event.target.value)
              }
            />
          </label>
          <label>
            Description
            <input
              maxLength={300}
              value={editingId ? editDescription : description}
              onChange={(event) =>
                editingId
                  ? setEditDescription(event.target.value)
                  : setDescription(event.target.value)
              }
            />
          </label>
          <div className="ui-dialog-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => setDrawerOpen(false)}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add tax rate"}
            </button>
          </div>
        </form>
      </Drawer>
      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={`${statusTarget?.isActive ? "Deactivate" : "Activate"} tax rate?`}
        description={`This changes ${statusTarget?.name ?? "the tax rate"} for future invoice drafts. Existing issued invoices keep their saved tax details.`}
        confirmLabel={statusTarget?.isActive ? "Deactivate" : "Activate"}
        busy={busy}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => {
          if (statusTarget)
            void toggle(statusTarget).then(
              (saved) => saved && setStatusTarget(null),
            );
        }}
      />
    </main>
  );
}
