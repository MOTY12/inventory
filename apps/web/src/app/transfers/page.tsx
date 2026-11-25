"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../features/auth/session-provider";
import Link from "next/link";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";

type Row = {
  id: string;
  number: string;
  status: string;
  sourceWarehouse: { name: string };
  destinationWarehouse: { name: string };
  _count: { lines: number };
};
type Page<T> = { data: T[]; total: number };
type Option = {
  id: string;
  name: string;
  baseUnit?: { code: string; name: string };
};
const api = "/organizations/current/inventory/transfers";
const quantityScale = BigInt(1_000_000);

function scaledQuantity(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) {
    throw new Error(
      "Quantity must be a non-negative decimal with up to 6 places.",
    );
  }
  return (
    BigInt(match[1]) * quantityScale + BigInt((match[2] ?? "").padEnd(6, "0"))
  );
}

function decimalQuantity(value: bigint): string {
  const whole = value / quantityScale;
  const fraction = String(value % quantityScale)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function isPositiveQuantity(value: string): boolean {
  try {
    return scaledQuantity(value) > BigInt(0);
  } catch {
    return false;
  }
}

export default function TransfersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>(
    [{ productId: "", quantity: "1" }],
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const receiptAttempt = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const canWrite = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "BUYER",
    "WAREHOUSE_CLERK",
  ].includes(organization?.role ?? "");
  const columns: DataTableColumn<Row>[] = [
    {
      key: "number",
      header: "Transfer",
      render: (r) => (
        <Link className="ui-primary-cell" href={`/transfers/${r.id}`}>
          {r.number}
        </Link>
      ),
    },
    { key: "source", header: "From", render: (r) => r.sourceWarehouse.name },
    {
      key: "destination",
      header: "To",
      render: (r) => r.destinationWarehouse.name,
    },
    {
      key: "lines",
      header: "Products",
      align: "right",
      render: (r) => r._count.lines,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="ui-row-actions">
          {canWrite && r.status === "DRAFT" && (
            <button
              className="ui-quiet-button"
              disabled={busy}
              onClick={() => void command(r.id, "submit")}
              type="button"
            >
              Submit
            </button>
          )}
          {canWrite && r.status === "SUBMITTED" && (
            <>
              <button
                className="ui-quiet-button"
                disabled={busy}
                onClick={() => void command(r.id, "cancel")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="ui-quiet-button"
                disabled={busy}
                onClick={() => void command(r.id, "dispatch")}
                type="button"
              >
                Dispatch
              </button>
            </>
          )}
          {canWrite &&
            ["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(r.status) && (
              <button
                className="ui-quiet-button"
                disabled={busy}
                onClick={() => void receive(r)}
                type="button"
              >
                Receive
              </button>
            )}
        </div>
      ),
    },
  ];
  const load = useCallback(async () => {
    if (!organization) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [r, w, p] = await Promise.all([
        authenticatedRequest<Page<Row>>(
          `${api}?page=${page}&page_size=20${query ? `&q=${encodeURIComponent(query)}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}${warehouseFilter ? `&warehouseId=${warehouseFilter}` : ""}`,
        ),
        authenticatedRequest<Page<Option>>(
          "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
        ),
        authenticatedRequest<Page<Option>>(
          "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setRows(r.data);
      setTotal(r.total);
      setWarehouses(w.data);
      setProducts(p.data);
      const nextSource = w.data.some((warehouse) => warehouse.id === source)
        ? source
        : w.data[0]?.id || "";
      const nextDestination =
        w.data.some((warehouse) => warehouse.id === destination) &&
        destination !== nextSource
          ? destination
          : w.data.find((warehouse) => warehouse.id !== nextSource)?.id || "";
      setSource(nextSource);
      setDestination(nextDestination);
      setLines((current) =>
        current.map((line, index) =>
          p.data.some((product) => product.id === line.productId)
            ? line
            : { ...line, productId: index === 0 ? p.data[0]?.id || "" : "" },
        ),
      );
      setWarehouseFilter((current) =>
        !current || w.data.some((warehouse) => warehouse.id === current)
          ? current
          : "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load transfers");
    } finally {
      setLoading(false);
    }
  }, [
    authenticatedRequest,
    destination,
    organization,
    page,
    query,
    statusFilter,
    source,
    warehouseFilter,
  ]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      setStatus("Transfer updated successfully.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await run(async () => {
      await authenticatedRequest(
        api,
        {
          sourceWarehouseId: source,
          destinationWarehouseId: destination,
          note: "",
          lines,
        },
        "POST",
      );
      setOpen(false);
    });
  }
  async function command(id: string, kind: "submit" | "cancel" | "dispatch") {
    if (
      kind === "dispatch" &&
      !window.confirm(
        "Dispatch this transfer? This will post outbound stock movements and mark the quantity in transit.",
      )
    ) {
      return;
    }
    if (
      kind === "cancel" &&
      !window.confirm("Cancel this transfer? This cannot be undone.")
    ) {
      return;
    }
    await run(() =>
      authenticatedRequest(
        `${api}/${id}/${kind}`,
        undefined,
        "POST",
        kind === "dispatch"
          ? { "Idempotency-Key": `transfer-dispatch-${id}` }
          : undefined,
      ),
    );
  }
  async function receive(row: Row) {
    setError("");
    try {
      const detail = await authenticatedRequest<{
        lines: {
          id: string;
          product: { name: string };
          requestedQuantity: string;
          receiptLines: { quantity: string }[];
        }[];
      }>(`${api}/${row.id}`);
      const line = detail.lines.find((candidate) => {
        const received = candidate.receiptLines.reduce(
          (sum, receipt) => sum + scaledQuantity(receipt.quantity),
          BigInt(0),
        );
        return scaledQuantity(candidate.requestedQuantity) > received;
      });
      if (!line) {
        setError("No outstanding quantity to receive.");
        return;
      }
      const received = line.receiptLines.reduce(
        (sum, receipt) => sum + scaledQuantity(receipt.quantity),
        BigInt(0),
      );
      const outstanding = decimalQuantity(
        scaledQuantity(line.requestedQuantity) - received,
      );
      const value = window.prompt(
        `Receive ${line.product.name}; outstanding ${outstanding}`,
        outstanding,
      );
      if (value === null || value === "") return;
      const receivedQuantity = scaledQuantity(value);
      const outstandingQuantity =
        scaledQuantity(line.requestedQuantity) - received;
      if (
        receivedQuantity <= BigInt(0) ||
        receivedQuantity > outstandingQuantity
      ) {
        setError(`Enter a quantity from 0.000001 to ${outstanding}.`);
        return;
      }
      const payload = {
        lines: [
          {
            transferLineId: line.id,
            quantity: decimalQuantity(receivedQuantity),
          },
        ],
      };
      const fingerprint = JSON.stringify({ transferId: row.id, payload });
      const key =
        receiptAttempt.current?.fingerprint === fingerprint
          ? receiptAttempt.current.key
          : crypto.randomUUID();
      receiptAttempt.current = { fingerprint, key };
      if (
        await run(() =>
          authenticatedRequest(`${api}/${row.id}/receipts`, payload, "POST", {
            "Idempotency-Key": key,
          }),
        )
      ) {
        receiptAttempt.current = null;
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the transfer.",
      );
    }
  }
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="INVENTORY OPERATIONS"
        title="Transfers"
        description="Move and track inventory between warehouses."
        action={
          canWrite && (
            <button
              className="button button-primary"
              onClick={() => setOpen((x) => !x)}
              disabled={!warehouses.length || !products.length || busy}
              type="button"
            >
              New transfer
            </button>
          )
        }
      />
      {error && (
        <div role="alert" className="error-banner">
          {error}
          <button
            className="button-link"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
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
            {lines.map((line, index) => (
              <div className="form-grid" key={index}>
                <label>
                  Product
                  <select
                    value={line.productId}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, i) =>
                          i === index
                            ? { ...item, productId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.baseUnit ? ` · ${item.baseUnit.code}` : ""}
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
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, i) =>
                          i === index
                            ? { ...item, quantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove line
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { productId: products[0]?.id || "", quantity: "1" },
                ])
              }
            >
              Add product line
            </button>
          </div>
          <div className="action-row">
            <button
              className="button button-primary"
              disabled={
                busy ||
                !source ||
                !destination ||
                source === destination ||
                !lines.length ||
                lines.some(
                  (line) =>
                    !line.productId || !isPositiveQuantity(line.quantity),
                ) ||
                new Set(lines.map((line) => line.productId)).size !==
                  lines.length
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
        <div className="form-grid">
          <label>
            Search transfer
            <input
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Transfer number"
            />
          </label>
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">All statuses</option>
              {[
                "DRAFT",
                "SUBMITTED",
                "IN_TRANSIT",
                "PARTIALLY_RECEIVED",
                "RECEIVED",
                "CANCELLED",
              ].map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Warehouse
            <select
              value={warehouseFilter}
              onChange={(event) => {
                setPage(1);
                setWarehouseFilter(event.target.value);
              }}
            >
              <option value="">All warehouses</option>
              {warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="panel">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          emptyTitle={
            total === 0
              ? "No warehouse transfers yet"
              : "No transfers match these filters"
          }
          emptyDescription="Create a draft to move inventory between warehouses."
        />
        <nav className="action-row" aria-label="Transfer pages">
          <button
            className="button button-secondary"
            disabled={page <= 1 || loading || busy}
            onClick={() => setPage((x) => x - 1)}
          >
            Previous
          </button>
          <span>
            {total} transfers · Page {page} of{" "}
            {Math.max(1, Math.ceil(total / 20))}
          </span>
          <button
            className="button button-secondary"
            disabled={page >= Math.ceil(total / 20) || loading || busy}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </button>
        </nav>
      </section>
    </main>
  );
}
