"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";
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
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );
  const load = useCallback(async () => {
    if (!organization) return;
    try {
      const p = new URLSearchParams({ page: String(page), page_size: "20" });
      if (query.trim()) p.set("q", query.trim());
      if (statusFilter) p.set("status", statusFilter);
      const result = await authenticatedRequest<Page<Customer>>(`${api}?${p}`);
      setRows(result.data);
      setTotal(result.total);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Customers could not be loaded",
      );
    }
  }, [authenticatedRequest, organization, page, query, statusFilter]);
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
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SALES</p>
          <h1>Customers</h1>
          <p>Keep customer contacts and delivery details organized.</p>
        </div>
        {canWrite && (
          <button
            className="button button-primary"
            onClick={() => setOpen((x) => !x)}
          >
            New customer
          </button>
        )}
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {open && (
        <section className="panel">
          <form onSubmit={create}>
            <h2>Customer details</h2>
            <div className="form-grid">
              <label>
                Name
                <input
                  required
                  minLength={2}
                  maxLength={180}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Customer type
                <select value={type} onChange={(e) => setType(e.target.value)}>
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
              <label>
                Notes
                <textarea
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
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
        </section>
      )}
      <section className="panel">
        <div className="form-grid">
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
        <div className="catalog-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/customers/${row.id}`}>
                      <strong>{row.name}</strong>
                    </Link>
                  </td>
                  <td>{row.type}</td>
                  <td>{row.contactName || "—"}</td>
                  <td>{row.email || "—"}</td>
                  <td>{row.phone || "—"}</td>
                  <td>
                    <span className="status-badge">{row.status}</span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>
                    No customers found. Add a customer to begin sales workflows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="action-row">
          <button
            className="button button-secondary"
            disabled={page <= 1}
            onClick={() => setPage((x) => x - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} · {total} customers
          </span>
          <button
            className="button button-secondary"
            disabled={page * 20 >= total}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
