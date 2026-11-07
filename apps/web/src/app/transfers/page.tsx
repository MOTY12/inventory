"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

type Row = {
  id: string;
  number: string;
  status: string;
  sourceWarehouse: { name: string };
  destinationWarehouse: { name: string };
  _count: { lines: number };
};
type Page<T> = { data: T[]; total: number };
type Option = { id: string; name: string };
const api = "/organizations/current/inventory/transfers";
export default function TransfersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    if (!organization) return;
    try {
      const [r, w, p] = await Promise.all([
        authenticatedRequest<Page<Row>>(`${api}?page=1&page_size=50`),
        authenticatedRequest<Page<Option>>(
          "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
        ),
        authenticatedRequest<Page<Option>>(
          "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setRows(r.data);
      setWarehouses(w.data);
      setProducts(p.data);
      setSource((x) => x || w.data[0]?.id || "");
      setDestination((x) => x || w.data[1]?.id || "");
      setProduct((x) => x || p.data[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load transfers");
    }
  }, [authenticatedRequest, organization]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      setStatus("Transfer updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await run(async () => {
      await authenticatedRequest(api, {
        method: "POST",
        body: JSON.stringify({
          sourceWarehouseId: source,
          destinationWarehouseId: destination,
          note: "",
          lines: [{ productId: product, quantity }],
        }),
      });
      setOpen(false);
    });
  }
  async function command(id: string, kind: "submit" | "cancel" | "dispatch") {
    await run(() =>
      authenticatedRequest(`${api}/${id}/${kind}`, {
        method: "POST",
        ...(kind === "dispatch"
          ? { headers: { "Idempotency-Key": `transfer-dispatch-${id}` } }
          : {}),
      }),
    );
  }
  async function receive(row: Row) {
    const detail = await authenticatedRequest<{
      lines: {
        id: string;
        product: { name: string };
        requestedQuantity: string;
        receiptLines: { quantity: string }[];
      }[];
    }>(`${api}/${row.id}`);
    const line = detail.lines.find(
      (x) =>
        Number(x.requestedQuantity) -
          x.receiptLines.reduce((n, y) => n + Number(y.quantity), 0) >
        0,
    );
    if (!line) {
      setError("No outstanding quantity to receive.");
      return;
    }
    const outstanding =
      Number(line.requestedQuantity) -
      line.receiptLines.reduce((n, y) => n + Number(y.quantity), 0);
    const value = window.prompt(
      `Receive ${line.product.name}; outstanding ${outstanding}`,
      String(outstanding),
    );
    if (!value) return;
    await run(() =>
      authenticatedRequest(`${api}/${row.id}/receipts`, {
        method: "POST",
        headers: {
          "Idempotency-Key": `transfer-receipt-${row.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          lines: [{ transferLineId: line.id, quantity: value }],
        }),
      }),
    );
  }
  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">INVENTORY OPERATIONS</p>
          <h1>Warehouse transfers</h1>
          <p>Move stock between warehouses and track what is in transit.</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => setOpen((x) => !x)}
          disabled={!warehouses.length || !products.length}
        >
          New transfer
        </button>
      </header>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="success-banner">
          {status}
        </p>
      )}
      {open && (
        <section className="panel">
          <h2>Transfer draft</h2>
          <div className="form-grid">
            <label>
              From
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                {warehouses
                  .filter((w) => w.id !== source)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Product
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </div>
          <div className="action-row">
            <button
              className="button button-primary"
              disabled={
                busy ||
                !source ||
                !destination ||
                source === destination ||
                !product
              }
              onClick={() => void create()}
            >
              Create draft
            </button>
            <button
              className="button button-secondary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="catalog-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>From</th>
                <th>To</th>
                <th>Lines</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.number}</strong>
                  </td>
                  <td>{r.sourceWarehouse.name}</td>
                  <td>{r.destinationWarehouse.name}</td>
                  <td>{r._count.lines}</td>
                  <td>
                    <span className="status-badge">
                      {r.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="action-row">
                    {r.status === "DRAFT" && (
                      <button
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() => void command(r.id, "submit")}
                      >
                        Submit
                      </button>
                    )}
                    {r.status === "SUBMITTED" && (
                      <>
                        <button
                          className="button button-secondary"
                          disabled={busy}
                          onClick={() => void command(r.id, "cancel")}
                        >
                          Cancel
                        </button>
                        <button
                          className="button button-primary"
                          disabled={busy}
                          onClick={() => void command(r.id, "dispatch")}
                        >
                          Dispatch
                        </button>
                      </>
                    )}
                    {["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(
                      r.status,
                    ) && (
                      <button
                        className="button button-primary"
                        disabled={busy}
                        onClick={() => void receive(r)}
                      >
                        Receive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>
                    No warehouse transfers yet. Create a draft to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
