"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

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
  async function create(event: FormEvent) {
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
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tax rate could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(row: TaxRate) {
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
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tax rate could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit(row: TaxRate) {
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
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tax rate could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE SETTINGS · FINANCE</p>
          <h1>Tax rates</h1>
          <p>
            Configure tax rates for new invoices. No statutory rates are
            preloaded.
          </p>
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
      <section className="catalog-panel">
        <h2>Add a tax rate</h2>
        <form className="form-grid" onSubmit={create}>
          <label>
            Name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Code
            <input
              required
              pattern="[A-Za-z0-9_-]{2,40}"
              maxLength={40}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label>
            Rate (%)
            <input
              required
              inputMode="decimal"
              pattern="(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </label>
          <label>
            Description
            <input
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <button className="button button-primary" disabled={busy}>
              {busy ? "Saving…" : "Add tax rate"}
            </button>
          </div>
        </form>
      </section>
      <section className="catalog-panel">
        <h2>Configured rates</h2>
        {loading ? (
          <p className="catalog-loading">Loading tax rates…</p>
        ) : rows.length === 0 ? (
          <div className="catalog-empty">
            <h3>No tax rates configured</h3>
            <p>
              Add only the rates your organization has approved for operational
              use.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Rate</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {editingId === row.id ? (
                        <input
                          aria-label="Tax rate name"
                          maxLength={120}
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      ) : (
                        row.name
                      )}
                    </td>
                    <td>
                      {editingId === row.id ? (
                        <input
                          aria-label="Tax rate code"
                          pattern="[A-Za-z0-9_-]{2,40}"
                          maxLength={40}
                          value={editCode}
                          onChange={(event) => setEditCode(event.target.value)}
                        />
                      ) : (
                        row.code
                      )}
                    </td>
                    <td>
                      {editingId === row.id ? (
                        <input
                          aria-label="Tax rate percentage"
                          inputMode="decimal"
                          value={editRate}
                          onChange={(event) => setEditRate(event.target.value)}
                        />
                      ) : (
                        `${row.rate}%`
                      )}
                    </td>
                    <td>
                      {editingId === row.id ? (
                        <input
                          aria-label="Tax rate description"
                          maxLength={300}
                          value={editDescription}
                          onChange={(event) =>
                            setEditDescription(event.target.value)
                          }
                        />
                      ) : (
                        (row.description ?? "—")
                      )}
                    </td>
                    <td>{row.isActive ? "Active" : "Inactive"}</td>
                    <td>
                      {editingId === row.id ? (
                        <>
                          <button
                            className="table-action"
                            disabled={busy}
                            onClick={() => void saveEdit(row)}
                          >
                            Save
                          </button>
                          <button
                            className="table-action"
                            disabled={busy}
                            onClick={() => setEditingId("")}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="table-action"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(row.id);
                              setEditName(row.name);
                              setEditCode(row.code);
                              setEditRate(row.rate);
                              setEditDescription(row.description ?? "");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="table-action"
                            disabled={busy}
                            onClick={() => toggle(row)}
                          >
                            {row.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
