"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../../features/auth/session-provider";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  termsNotes: string | null;
  status: "ACTIVE" | "ARCHIVED";
};
type Page<T> = { data: T[]; total: number; page: number; page_size: number };
type AuditEvent = {
  action: string;
  occurredAt: string;
  actor: { email: string };
};

const endpoint = "/organizations/current/procurement/suppliers";
const fields = [
  ["contactName", "Contact name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["addressLine1", "Address line 1"],
  ["addressLine2", "Address line 2"],
  ["city", "City"],
  ["region", "State / region"],
  ["postalCode", "Postal code"],
  ["countryCode", "Country code"],
  ["termsNotes", "Terms notes"],
] as const;

function SuppliersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<{
    supplierId: string;
    events: AuditEvent[];
  } | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );

  const reload = useCallback(async () => {
    if (!organization) {
      setSuppliers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        status,
      });
      if (query.trim()) params.set("q", query.trim());
      const result = await authenticatedRequest<Page<Supplier>>(
        `${endpoint}?${params}`,
      );
      setSuppliers(result.data);
      setTotal(result.total);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load suppliers.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization, page, query, status]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  useEffect(() => {
    if (!organization || !selected) return;
    let cancelled = false;
    void authenticatedRequest<AuditEvent[]>(`${endpoint}/${selected}/audit`)
      .then((events) => {
        if (!cancelled) setAuditHistory({ supplierId: selected, events });
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load supplier history.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedRequest, organization, selected]);

  function clearForm() {
    setName("");
    setValues({});
    setEditing(null);
  }

  function edit(supplier: Supplier) {
    setEditing(supplier.id);
    setName(supplier.name);
    setValues(
      Object.fromEntries(fields.map(([key]) => [key, supplier[key] ?? ""])),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = {
        name,
        ...Object.fromEntries(
          fields.map(([key]) => [key, values[key]?.trim() || null]),
        ),
      };
      await authenticatedRequest(
        `${endpoint}${editing ? `/${editing}` : ""}`,
        body,
        editing ? "PATCH" : "POST",
      );
      setNotice(editing ? "Supplier updated." : "Supplier created.");
      clearForm();
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save supplier.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive(supplier: Supplier) {
    if (!window.confirm(`Archive ${supplier.name}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `${endpoint}/${supplier.id}/archive`,
        {},
        "PATCH",
      );
      setNotice("Supplier archived.");
      if (selected === supplier.id) setSelected(null);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive supplier.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="products-page">
      <header className="products-heading">
        <div>
          <Link href="/" className="catalog-back">
            ← Dashboard
          </Link>
          <p className="catalog-eyebrow">PURCHASING</p>
          <h1>Suppliers</h1>
          <p>
            Keep supplier contacts and delivery addresses organized for your
            workspace.
          </p>
        </div>
        <Link className="catalog-secondary-link" href="/products">
          Products
        </Link>
      </header>
      {notice && (
        <p className="catalog-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="catalog-error" role="alert">
          {error}
        </p>
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
          {canWrite && (
            <form className="product-editor" onSubmit={save}>
              <div className="catalog-panel-heading">
                <div>
                  <span className="catalog-eyebrow">
                    {editing ? "EDIT SUPPLIER" : "NEW SUPPLIER"}
                  </span>
                  <h2>{editing ? "Update supplier" : "Add a supplier"}</h2>
                </div>
                {editing && (
                  <button
                    type="button"
                    className="catalog-text-button"
                    onClick={clearForm}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
              <div className="product-form-grid">
                <label>
                  Supplier name
                  <input
                    required
                    minLength={2}
                    maxLength={180}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                {fields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      maxLength={key === "termsNotes" ? 1000 : 500}
                      type={
                        key === "email"
                          ? "email"
                          : key === "website"
                            ? "url"
                            : "text"
                      }
                      value={values[key] ?? ""}
                      onChange={(e) =>
                        setValues((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="primary-button" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save supplier"
                    : "Create supplier"}
              </button>
            </form>
          )}
          <section className="product-list-panel">
            <div className="catalog-panel-heading">
              <div>
                <span className="catalog-eyebrow">DIRECTORY</span>
                <h2>Active suppliers</h2>
              </div>
              <span className="catalog-count">{total} total</span>
            </div>
            <div className="supplier-filters">
              <label className="supplier-search">
                Search suppliers
                <input
                  value={query}
                  onChange={(e) => {
                    setPage(1);
                    setQuery(e.target.value);
                  }}
                  placeholder="Name, contact, email or phone"
                />
              </label>
              <label className="supplier-search">
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setStatus(e.target.value as "ACTIVE" | "ARCHIVED");
                  }}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>
            {loading ? (
              <p role="status">Loading suppliers…</p>
            ) : suppliers.length === 0 ? (
              <div className="catalog-empty">
                <h3>No suppliers found</h3>
                <p>Create a supplier or change your search.</p>
              </div>
            ) : (
              <div className="product-table-wrap">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td>
                          <button
                            className="catalog-text-button"
                            onClick={() =>
                              setSelected(
                                selected === supplier.id ? null : supplier.id,
                              )
                            }
                          >
                            {supplier.name}
                          </button>
                        </td>
                        <td>{supplier.contactName || supplier.phone || "—"}</td>
                        <td>{supplier.email || "—"}</td>
                        <td>{supplier.status}</td>
                        <td>
                          {canWrite && (
                            <>
                              <button
                                className="catalog-text-button"
                                onClick={() => edit(supplier)}
                              >
                                Edit
                              </button>
                              <button
                                className="catalog-text-button"
                                disabled={busy}
                                onClick={() => void archive(supplier)}
                              >
                                Archive
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
            {selected &&
              suppliers
                .filter((s) => s.id === selected)
                .map((supplier) => (
                  <article className="catalog-panel" key={supplier.id}>
                    <h3>{supplier.name}</h3>
                    <dl className="supplier-details">
                      {fields.map(
                        ([key, label]) =>
                          supplier[key] && (
                            <div key={key}>
                              <dt>{label}</dt>
                              <dd>{supplier[key]}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                    <h4>Change history</h4>
                    {auditHistory?.supplierId === supplier.id &&
                    auditHistory.events.length ? (
                      <ul>
                        {auditHistory.events.map((event, index) => (
                          <li
                            key={`${event.action}-${event.occurredAt}-${index}`}
                          >
                            {event.action} · {event.actor.email} ·{" "}
                            {new Date(event.occurredAt).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    ) : auditHistory?.supplierId === supplier.id ? (
                      <p>No history yet.</p>
                    ) : (
                      <p>Loading or no history yet.</p>
                    )}
                  </article>
                ))}
            <div className="product-pagination">
              <button
                className="catalog-secondary-link"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="catalog-secondary-link"
                disabled={page * 20 >= total || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function SuppliersRoute() {
  return <SuppliersPage />;
}
