"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";
import { Drawer } from "../../components/ui/drawer";
type Customer = {
  id: string;
  name: string;
  type: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};
type Page<T> = { data: T[]; total: number };
const api = "/organizations/current/sales/customers";
export default function CustomersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("BUSINESS");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [billingStreet, setBillingStreet] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );
  const columns: DataTableColumn<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <Link className="ui-primary-cell" href={`/customers/${row.id}`}>
          {row.name}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (row.type === "BUSINESS" ? "Business" : "Individual"),
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => row.contactName || "—",
    },
    { key: "email", header: "Email", render: (row) => row.email || "—" },
    { key: "phone", header: "Phone", render: (row) => row.phone || "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!organization) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), page_size: "20" });
      if (debouncedQuery) p.set("q", debouncedQuery);
      if (statusFilter) p.set("status", statusFilter);
      const result = await authenticatedRequest<Page<Customer>>(`${api}?${p}`);
      if (version !== requestVersion.current) return;
      setRows(result.data);
      setTotal(result.total);
      setError("");
    } catch (e) {
      if (version !== requestVersion.current) return;
      setError(
        e instanceof Error ? e.message : "Customers could not be loaded",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [authenticatedRequest, organization, page, debouncedQuery, statusFilter]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        api,
        {
          name,
          type,
          contactName: contactName || undefined,
          email: email || undefined,
          phone: phone || undefined,
          billingAddressLine1: billingStreet || undefined,
          billingCity: billingCity || undefined,
          billingCountryCode: "NG",
          shippingAddressLine1: shippingStreet || undefined,
          shippingCity: shippingCity || undefined,
          shippingCountryCode: "NG",
          notes: notes || undefined,
        },
        "POST",
      );
      setOpen(false);
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setBillingStreet("");
      setBillingCity("");
      setShippingStreet("");
      setShippingCity("");
      setNotes("");
      setNotice("Customer created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Customer could not be saved");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="SALES"
        title="Customers"
        description="Keep customer contacts and delivery details organized."
        action={
          canWrite ? (
            <button
              className="button button-primary"
              onClick={() => setOpen((x) => !x)}
              type="button"
            >
              New customer
            </button>
          ) : undefined
        }
      />
      {!organization && (
        <section className="catalog-empty">
          <h2>Choose a business first</h2>
          <p>Customer records belong to the active organization.</p>
          <Link className="catalog-secondary-link" href="/organizations">
            Business settings
          </Link>
        </section>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="catalog-text-button"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {open && organization && (
        <Drawer
          open={open}
          title="New customer"
          description="Add the customer details used for orders and delivery."
          onClose={() => setOpen(false)}
        >
          <form className="ui-drawer-form" onSubmit={create}>
            <section className="ui-form-section">
              <h3>Customer information</h3>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    minLength={2}
                    maxLength={180}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Customer type
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="BUSINESS">Business</option>
                    <option value="INDIVIDUAL">Individual</option>
                  </select>
                </label>
                <label>
                  Contact person
                  <input
                    maxLength={180}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    maxLength={320}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>
            </section>
            <section className="ui-form-section">
              <h3>Address information</h3>
              <div className="form-grid">
                <label>
                  Billing street
                  <input
                    maxLength={240}
                    value={billingStreet}
                    onChange={(e) => setBillingStreet(e.target.value)}
                  />
                </label>
                <label>
                  Billing city
                  <input
                    maxLength={120}
                    value={billingCity}
                    onChange={(e) => setBillingCity(e.target.value)}
                  />
                </label>
                <label>
                  Shipping street
                  <input
                    maxLength={240}
                    value={shippingStreet}
                    onChange={(e) => setShippingStreet(e.target.value)}
                  />
                </label>
                <label>
                  Shipping city
                  <input
                    maxLength={120}
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                  />
                </label>
              </div>
            </section>
            <section className="ui-form-section">
              <h3>Notes</h3>
              <div className="form-grid">
                <label>
                  Notes
                  <textarea
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </div>
            </section>
            <div className="action-row">
              <button className="button button-primary" disabled={busy}>
                Create customer
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Drawer>
      )}
      {organization && (
        <section className="ui-list-panel" aria-label="Customer directory">
          <div className="ui-filter-toolbar">
            <label>
              Search
              <input
                value={query}
                onChange={(e) => {
                  setPage(1);
                  setQuery(e.target.value);
                }}
                placeholder="Name, contact, email or phone"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value);
                }}
              >
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
                <option value="">All</option>
              </select>
            </label>
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle={
              query.trim() || statusFilter !== "ACTIVE"
                ? "No customers match these filters"
                : "No customers yet"
            }
            emptyDescription={
              query.trim() || statusFilter !== "ACTIVE"
                ? "Clear or adjust the filters to see more customers."
                : "Add a customer to begin using sales workflows."
            }
          />
          {!loading && (
            <nav className="ui-pagination" aria-label="Customer pages">
              <button
                className="button button-secondary"
                disabled={page <= 1}
                onClick={() => setPage((x) => x - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / 20))} · {total}{" "}
                customers
              </span>
              <button
                className="button button-secondary"
                disabled={page * 20 >= total}
                onClick={() => setPage((x) => x + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
