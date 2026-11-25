"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Drawer } from "../../components/ui/drawer";

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
const fieldGroups: { title: string; keys: readonly string[] }[] = [
  {
    title: "Contact information",
    keys: ["contactName", "email", "phone", "website"],
  },
  {
    title: "Address",
    keys: [
      "addressLine1",
      "addressLine2",
      "city",
      "region",
      "postalCode",
      "countryCode",
    ],
  },
  { title: "Purchasing notes", keys: ["termsNotes"] },
] as const;

function SuppliersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);
  const [auditHistory, setAuditHistory] = useState<{
    supplierId: string;
    events: AuditEvent[];
  } | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestVersion = useRef(0);
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const columns: DataTableColumn<Supplier>[] = [
    {
      key: "name",
      header: "Supplier",
      render: (supplier) => (
        <button
          className="ui-primary-cell ui-cell-button"
          aria-expanded={selected === supplier.id}
          aria-label={`${selected === supplier.id ? "Hide" : "Show"} details for ${supplier.name}`}
          onClick={() =>
            setSelected(selected === supplier.id ? null : supplier.id)
          }
          type="button"
        >
          {supplier.name}
        </button>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (supplier) => supplier.contactName || "—",
    },
    {
      key: "email",
      header: "Email",
      render: (supplier) => supplier.email || "—",
    },
    {
      key: "phone",
      header: "Phone",
      render: (supplier) => supplier.phone || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (supplier) => <StatusBadge status={supplier.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (supplier) =>
        canWrite ? (
          <div className="ui-row-actions">
            <button
              className="ui-quiet-button"
              onClick={() => edit(supplier)}
              type="button"
            >
              Edit
            </button>
            <button
              className="ui-quiet-button ui-danger-button"
              disabled={busy}
              onClick={() => setArchiveTarget(supplier)}
              type="button"
            >
              Archive
            </button>
          </div>
        ) : (
          <span className="ui-muted-cell">—</span>
        ),
    },
  ];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!organization) {
      setSuppliers([]);
      setTotal(0);
      setSelected(null);
      setAuditHistory(null);
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
      if (debouncedQuery) params.set("q", debouncedQuery);
      const result = await authenticatedRequest<Page<Supplier>>(
        `${endpoint}?${params}`,
      );
      if (version !== requestVersion.current) return;
      setSuppliers(result.data);
      setTotal(result.total);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(
        cause instanceof Error ? cause.message : "Could not load suppliers.",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [authenticatedRequest, organization, page, debouncedQuery, status]);

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
    setFormOpen(false);
  }

  function edit(supplier: Supplier) {
    setEditing(supplier.id);
    setFormOpen(true);
    setName(supplier.name);
    setValues(
      Object.fromEntries(fields.map(([key]) => [key, supplier[key] ?? ""])),
    );
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

  async function archive() {
    if (!archiveTarget) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `${endpoint}/${archiveTarget.id}/archive`,
        {},
        "PATCH",
      );
      setNotice("Supplier archived.");
      if (selected === archiveTarget.id) setSelected(null);
      setArchiveTarget(null);
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
    <div className="ui-page">
      <PageHeader
        eyebrow="PURCHASING"
        title="Suppliers"
        description="Keep supplier contacts and delivery addresses organized for your business."
        action={
          canWrite ? (
            <button
              aria-controls="supplier-editor"
              aria-expanded={formOpen || Boolean(editing)}
              className="button button-primary"
              onClick={() => {
                clearForm();
                setFormOpen(true);
              }}
              type="button"
            >
              Add supplier
            </button>
          ) : undefined
        }
      />
      {notice && (
        <p className="catalog-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="catalog-error" role="alert">
          <span>{error}</span>
          <button
            className="catalog-text-button"
            onClick={() => void reload()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {!organization ? (
        <section className="catalog-empty">
          <h2>Choose a business first</h2>
          <Link className="primary-button" href="/organizations">
            Business settings
          </Link>
        </section>
      ) : (
        <>
          {canWrite && (formOpen || editing) && (
            <Drawer
              id="supplier-editor"
              open={Boolean(formOpen || editing)}
              title={editing ? "Edit supplier" : "Add supplier"}
              description="Maintain the supplier details used by purchasing."
              onClose={clearForm}
            >
              <form className="ui-drawer-form" onSubmit={save}>
                <section className="ui-form-section">
                  <h3>Supplier information</h3>
                  <div className="product-form-grid">
                    <label>
                      Supplier name
                      <input
                        autoFocus
                        required
                        minLength={2}
                        maxLength={180}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                  </div>
                </section>
                {fieldGroups.map((group) => (
                  <section className="ui-form-section" key={group.title}>
                    <h3>{group.title}</h3>
                    <div className="product-form-grid">
                      {fields
                        .filter(([key]) => group.keys.includes(key))
                        .map(([key, label]) => (
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
                  </section>
                ))}
                <div className="ui-drawer-actions">
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={clearForm}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="button button-primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : editing
                        ? "Save supplier"
                        : "Create supplier"}
                  </button>
                </div>
              </form>
            </Drawer>
          )}
          <section className="ui-list-panel">
            <div className="ui-list-heading">
              <div>
                <span className="catalog-eyebrow">DIRECTORY</span>
                <h2>
                  {status === "ACTIVE"
                    ? "Active suppliers"
                    : "Archived suppliers"}
                </h2>
              </div>
              <span className="catalog-count">{total} total</span>
            </div>
            <div className="ui-filter-toolbar">
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
            <DataTable
              columns={columns}
              rows={suppliers}
              rowKey={(supplier) => supplier.id}
              loading={loading}
              emptyTitle={
                query.trim() || status !== "ACTIVE"
                  ? "No suppliers match these filters"
                  : "No suppliers yet"
              }
              emptyDescription="Add a supplier or adjust your search and status filters."
            />
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
            <nav className="ui-pagination" aria-label="Supplier pages">
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
            </nav>
          </section>
          <ConfirmDialog
            open={Boolean(archiveTarget)}
            title="Archive this supplier?"
            description={`${archiveTarget?.name ?? "This supplier"} will be removed from the active supplier list. Existing purchase history is retained.`}
            confirmLabel="Archive supplier"
            busy={busy}
            onConfirm={() => void archive()}
            onCancel={() => setArchiveTarget(null)}
          />
        </>
      )}
    </div>
  );
}

export default function SuppliersRoute() {
  return <SuppliersPage />;
}
