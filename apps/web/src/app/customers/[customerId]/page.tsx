"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";
type Customer = {
  id: string;
  name: string;
  type: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingRegion: string | null;
  billingPostalCode: string | null;
  billingCountryCode: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingRegion: string | null;
  shippingPostalCode: string | null;
  shippingCountryCode: string | null;
  notes: string | null;
  status: string;
};
type AddressFields = Pick<
  Customer,
  | "billingAddressLine1"
  | "billingAddressLine2"
  | "billingCity"
  | "billingRegion"
  | "billingPostalCode"
  | "billingCountryCode"
  | "shippingAddressLine1"
  | "shippingAddressLine2"
  | "shippingCity"
  | "shippingRegion"
  | "shippingPostalCode"
  | "shippingCountryCode"
>;
const addressFields: { key: keyof AddressFields; label: string }[] = [
  { key: "billingAddressLine1", label: "Billing street" },
  { key: "billingAddressLine2", label: "Billing street 2" },
  { key: "billingCity", label: "Billing city" },
  { key: "billingRegion", label: "Billing region" },
  { key: "billingPostalCode", label: "Billing postal code" },
  { key: "billingCountryCode", label: "Billing country code" },
  { key: "shippingAddressLine1", label: "Shipping street" },
  { key: "shippingAddressLine2", label: "Shipping street 2" },
  { key: "shippingCity", label: "Shipping city" },
  { key: "shippingRegion", label: "Shipping region" },
  { key: "shippingPostalCode", label: "Shipping postal code" },
  { key: "shippingCountryCode", label: "Shipping country code" },
];
const api = "/organizations/current/sales/customers";
export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { organization, authenticatedRequest } = useSession();
  const [row, setRow] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("BUSINESS");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addresses, setAddresses] = useState<AddressFields>({
    billingAddressLine1: null,
    billingAddressLine2: null,
    billingCity: null,
    billingRegion: null,
    billingPostalCode: null,
    billingCountryCode: null,
    shippingAddressLine1: null,
    shippingAddressLine2: null,
    shippingCity: null,
    shippingRegion: null,
    shippingPostalCode: null,
    shippingCountryCode: null,
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<
    {
      id: string;
      action: string;
      occurredAt: string;
      actor: { email: string };
    }[]
  >([]);
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );
  const load = useCallback(async () => {
    if (!organization) return;
    try {
      const [customer, events] = await Promise.all([
        authenticatedRequest<Customer>(`${api}/${customerId}`),
        authenticatedRequest<typeof history>(`${api}/${customerId}/audit`),
      ]);
      setRow(customer);
      setName(customer.name);
      setType(customer.type);
      setContactName(customer.contactName || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");
      setAddresses({
        billingAddressLine1: customer.billingAddressLine1,
        billingAddressLine2: customer.billingAddressLine2,
        billingCity: customer.billingCity,
        billingRegion: customer.billingRegion,
        billingPostalCode: customer.billingPostalCode,
        billingCountryCode: customer.billingCountryCode,
        shippingAddressLine1: customer.shippingAddressLine1,
        shippingAddressLine2: customer.shippingAddressLine2,
        shippingCity: customer.shippingCity,
        shippingRegion: customer.shippingRegion,
        shippingPostalCode: customer.shippingPostalCode,
        shippingCountryCode: customer.shippingCountryCode,
      });
      setNotes(customer.notes || "");
      setHistory(events);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Customer could not be loaded");
    }
  }, [authenticatedRequest, customerId, organization]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!row) return;
    setBusy(true);
    try {
      await authenticatedRequest(
        `${api}/${row.id}`,
        {
          name,
          type,
          contactName,
          email,
          phone,
          ...addresses,
          notes,
        },
        "PATCH",
      );
      setNotice("Customer updated.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Customer could not be updated",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!row) return;
    setBusy(true);
    try {
      await authenticatedRequest(
        `${api}/${row.id}/archive`,
        undefined,
        "PATCH",
      );
      setNotice("Customer archived.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Customer could not be archived",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content">
      <p>
        <Link href="/customers">← Customers</Link>
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {!row ? (
        <p>Loading customer…</p>
      ) : (
        <>
          <header className="page-heading">
            <div>
              <p className="eyebrow">CUSTOMER RECORD</p>
              <h1>{row.name}</h1>
              <p>
                {row.type} · {row.status}
              </p>
            </div>
            {canWrite && row.status === "ACTIVE" && (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => void archive()}
              >
                Archive customer
              </button>
            )}
          </header>
          {notice && (
            <p role="status" className="success-banner">
              {notice}
            </p>
          )}
          {canWrite && row.status === "ACTIVE" && (
            <section className="panel">
              <form onSubmit={save}>
                <h2>Customer details</h2>
                <div className="form-grid">
                  <label>
                    Name
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Customer type
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                    >
                      <option value="BUSINESS">Business</option>
                      <option value="INDIVIDUAL">Individual</option>
                    </select>
                  </label>
                  <label>
                    Contact person
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                  {addressFields.map(({ key, label }) => (
                    <label key={key}>
                      {label}
                      <input
                        maxLength={
                          key.toLowerCase().includes("country") ? 2 : 240
                        }
                        value={addresses[key] || ""}
                        onChange={(event) =>
                          setAddresses((current) => ({
                            ...current,
                            [key]: key.toLowerCase().includes("country")
                              ? event.target.value.toUpperCase()
                              : event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Notes
                    <textarea
                      maxLength={1000}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                </div>
                <button className="button button-primary" disabled={busy}>
                  Save changes
                </button>
              </form>
            </section>
          )}
          <section className="panel">
            <h2>Addresses and notes</h2>
            <div className="form-grid">
              <div>
                <h3>Billing address</h3>
                <p>
                  {[
                    row.billingAddressLine1,
                    row.billingAddressLine2,
                    row.billingCity,
                    row.billingRegion,
                    row.billingPostalCode,
                    row.billingCountryCode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "No billing address"}
                </p>
              </div>
              <div>
                <h3>Shipping address</h3>
                <p>
                  {[
                    row.shippingAddressLine1,
                    row.shippingAddressLine2,
                    row.shippingCity,
                    row.shippingRegion,
                    row.shippingPostalCode,
                    row.shippingCountryCode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "No shipping address"}
                </p>
              </div>
              <div>
                <h3>Notes</h3>
                <p>{row.notes || "No notes"}</p>
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Activity</h2>
            {history.length ? (
              <ol>
                {history.map((event) => (
                  <li key={event.id}>
                    {event.action} ·{" "}
                    {new Date(event.occurredAt).toLocaleString()} ·{" "}
                    {event.actor.email}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No activity yet.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
