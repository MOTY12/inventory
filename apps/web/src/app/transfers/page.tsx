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
import { TableToolbar } from "../../components/ui/table-toolbar";
import { TablePagination } from "../../components/ui/table-pagination";

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

export default function TransfersPage() {
  const { organization, authenticatedRequest } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
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
      const [r, w] = await Promise.all([
        authenticatedRequest<Page<Row>>(
          `${api}?page=${page}&page_size=20${query ? `&q=${encodeURIComponent(query)}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}${warehouseFilter ? `&warehouseId=${warehouseFilter}` : ""}`,
        ),
        authenticatedRequest<Page<Option>>(
          "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setRows(r.data);
      setTotal(r.total);
      setWarehouses(w.data);
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
    organization,
    page,
    query,
    statusFilter,
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
            <Link className="button button-primary" href="/transfers/new">
              ＋ New transfer
            </Link>
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
      <section className="panel">
        <TableToolbar
          query={query}
          queryLabel="Search transfers"
          queryPlaceholder="Transfer number"
          onQueryChange={(value) => {
            setPage(1);
            setQuery(value);
          }}
        >
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
        </TableToolbar>
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
        <TablePagination
          page={page}
          pageSize={20}
          total={total}
          loading={loading || busy}
          onPageChange={setPage}
          onPageSizeChange={() => setPage(1)}
        />
      </section>
    </main>
  );
}
