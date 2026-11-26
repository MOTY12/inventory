"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";
import { Drawer } from "../../components/ui/drawer";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { TablePagination } from "../../components/ui/table-pagination";

type Warehouse = { id: string; name: string; code: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  baseUnit: { code: string; name: string };
};
type Adjustment = {
  id: string;
  productId: string;
  reason: string;
  systemQuantity: string;
  countedQuantity: string;
  status: "DRAFT" | "POSTED";
  createdAt: string;
};
type Movement = {
  id: string;
  movementType: string;
  quantityDelta: string;
  documentType: string;
  occurredAt: string;
  product: { name: string; sku: string };
};
type Balance = {
  productId: string;
  onHand: string;
  reserved: string;
  inTransit: string;
  product: {
    id: string;
    name: string;
    sku: string;
    baseUnit: { code: string; name: string };
  };
};
type Page<T> = { data: T[]; total: number };
type InventoryView = "counts" | "balances" | "movements";

function subtractQuantities(left: string, right: string): string {
  const scale = BigInt(1_000_000);
  const toScaled = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * scale + BigInt(fraction.padEnd(6, "0"));
  };
  const difference = toScaled(left) - toScaled(right);
  const sign = difference < BigInt(0) ? "-" : "";
  const absolute = difference < BigInt(0) ? -difference : difference;
  return `${sign}${absolute / scale}.${String(absolute % scale).padStart(6, "0")}`;
}

function InventoryManager() {
  const { organization, authenticatedRequest } = useSession();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [balancePage, setBalancePage] = useState(1);
  const [balancePageSize, setBalancePageSize] = useState(100);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(50);
  const [movementTotal, setMovementTotal] = useState(0);
  const [countPage, setCountPage] = useState(1);
  const [countPageSize, setCountPageSize] = useState(20);
  const [countTotal, setCountTotal] = useState(0);
  const [view, setView] = useState<InventoryView>("counts");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] =
    useState<Adjustment | null>(null);
  const [postTarget, setPostTarget] = useState<Adjustment | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "BUYER",
    "WAREHOUSE_CLERK",
  ].includes(organization?.role ?? "");
  const selectedProduct = products.find((product) => product.id === productId);

  const reload = useCallback(async () => {
    if (!organization) {
      setWarehouses([]);
      setProducts([]);
      setAdjustments([]);
      setMovements([]);
      setBalances([]);
      setBalanceTotal(0);
      setCountTotal(0);
      setMovementTotal(0);
      setWarehouseId("");
      setProductId("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [locations, catalog] = await Promise.all([
        authenticatedRequest<Page<Warehouse>>(
          "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
        ),
        authenticatedRequest<Page<Product>>(
          "/organizations/current/catalog/products?page=1&page_size=100&status=ACTIVE",
        ),
      ]);
      setWarehouses(locations.data);
      setProducts(catalog.data);
      const selected = locations.data.some(
        (warehouse) => warehouse.id === warehouseId,
      )
        ? warehouseId
        : locations.data[0]?.id || "";
      setWarehouseId(selected);
      setProductId((current) =>
        catalog.data.some((product) => product.id === current) ? current : "",
      );
      if (selected) {
        const [counts, movementResult, balanceResult] = await Promise.all([
          authenticatedRequest<Page<Adjustment>>(
            `/inventory/warehouses/${selected}/adjustments?page=${countPage}&page_size=${countPageSize}`,
          ),
          authenticatedRequest<Page<Movement>>(
            `/inventory/warehouses/${selected}/movements?page=${movementPage}&page_size=${movementPageSize}`,
          ),
          authenticatedRequest<Page<Balance>>(
            `/inventory/warehouses/${selected}/balances?page=${balancePage}&page_size=${balancePageSize}`,
          ),
        ]);
        setAdjustments(counts.data);
        setCountTotal(counts.total);
        setMovements(movementResult.data);
        setMovementTotal(movementResult.total);
        setBalances(balanceResult.data);
        setBalanceTotal(balanceResult.total);
      } else {
        setAdjustments([]);
        setCountTotal(0);
        setMovements([]);
        setMovementTotal(0);
        setBalances([]);
        setBalanceTotal(0);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load inventory.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    authenticatedRequest,
    balancePage,
    balancePageSize,
    countPage,
    countPageSize,
    movementPage,
    movementPageSize,
    organization,
    warehouseId,
  ]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function createCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!warehouseId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const draft = await authenticatedRequest<Adjustment>(
        `/inventory/warehouses/${warehouseId}/adjustments`,
        { productId, countedQuantity, reason },
        "POST",
      );
      setNotice(
        `Count saved. Variance: ${subtractQuantities(draft.countedQuantity, draft.systemQuantity)} base units.`,
      );
      setCountedQuantity("");
      setReason("");
      setCreateOpen(false);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the count.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function postCount(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `/inventory/warehouses/${warehouseId}/adjustments/${id}/post`,
        {},
        "POST",
      );
      setNotice("Count variance posted to the stock ledger.");
      setPostTarget(null);
      setSelectedAdjustment(null);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not post the count.",
      );
    } finally {
      setBusy(false);
    }
  }

  const adjustmentColumns: DataTableColumn<Adjustment>[] = [
    {
      key: "id",
      header: "Count ID",
      render: (row) => (
        <button
          className="ui-primary-cell ui-cell-button"
          type="button"
          onClick={() => setSelectedAdjustment(row)}
        >
          #{row.id.slice(0, 8)}
        </button>
      ),
    },
    {
      key: "product",
      header: "Product",
      render: (row) => {
        const product = products.find(
          (candidate) => candidate.id === row.productId,
        );
        return product ? (
          <>
            <strong>{product.name}</strong>
            <br />
            <span className="ui-muted-cell">{product.sku}</span>
          </>
        ) : (
          row.productId
        );
      },
    },
    {
      key: "expected",
      header: "Expected",
      align: "right",
      render: (row) => row.systemQuantity,
    },
    {
      key: "counted",
      header: "Counted",
      align: "right",
      render: (row) => row.countedQuantity,
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      render: (row) => {
        const variance = subtractQuantities(
          row.countedQuantity,
          row.systemQuantity,
        );
        return <strong>{variance}</strong>;
      },
    },
    {
      key: "date",
      header: "Date",
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <span className="ui-row-actions">
          <button
            className="ui-quiet-button"
            type="button"
            onClick={() => setSelectedAdjustment(row)}
          >
            Details
          </button>
          {row.status === "DRAFT" && canWrite ? (
            <button
              className="ui-quiet-button"
              type="button"
              disabled={busy}
              onClick={() => setPostTarget(row)}
            >
              Post variance
            </button>
          ) : null}
        </span>
      ),
    },
  ];
  const balanceColumns: DataTableColumn<Balance>[] = [
    {
      key: "product",
      header: "Product",
      render: (row) => (
        <Link className="ui-primary-cell" href={`/products/${row.product.id}`}>
          {row.product.name}
        </Link>
      ),
    },
    { key: "sku", header: "SKU", render: (row) => row.product.sku },
    {
      key: "onHand",
      header: "On hand",
      align: "right",
      render: (row) => row.onHand,
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right",
      render: (row) => row.reserved,
    },
    {
      key: "available",
      header: "Available",
      align: "right",
      render: (row) => subtractQuantities(row.onHand, row.reserved),
    },
    {
      key: "transit",
      header: "In transit",
      align: "right",
      render: (row) => row.inTransit,
    },
  ];
  const movementColumns: DataTableColumn<Movement>[] = [
    {
      key: "product",
      header: "Product",
      render: (row) => (
        <>
          <strong>{row.product.name}</strong>
          <br />
          <span className="ui-muted-cell">{row.product.sku}</span>
        </>
      ),
    },
    { key: "type", header: "Movement", render: (row) => row.movementType },
    { key: "document", header: "Source", render: (row) => row.documentType },
    {
      key: "quantity",
      header: "Quantity change",
      align: "right",
      render: (row) => row.quantityDelta,
    },
    {
      key: "date",
      header: "Date",
      render: (row) => new Date(row.occurredAt).toLocaleString(),
    },
  ];

  return (
    <main className="ui-page">
      <Link href="/" className="text-button">
        ← Dashboard
      </Link>
      <PageHeader
        eyebrow="STOCK CONTROL"
        title="Inventory"
        description="Review physical counts, warehouse balances, and immutable stock movements."
        action={
          view === "counts" && canWrite ? (
            <button
              className="button button-primary"
              type="button"
              disabled={!warehouseId || !products.length}
              onClick={() => setCreateOpen(true)}
            >
              New stock count
            </button>
          ) : undefined
        }
      />
      {notice ? (
        <p className="ui-success-banner" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
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
      ) : null}
      {!organization ? (
        <section className="ui-panel">
          <p>Select a business to view inventory.</p>
        </section>
      ) : (
        <section className="ui-panel">
          <div className="ui-filter-toolbar">
            <label>
              Warehouse
              <select
                value={warehouseId}
                onChange={(event) => {
                  setBalancePage(1);
                  setCountPage(1);
                  setMovementPage(1);
                  setWarehouseId(event.target.value);
                }}
              >
                <option value="">Choose warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="ui-tabs" role="tablist" aria-label="Inventory views">
            <button
              role="tab"
              aria-selected={view === "counts"}
              className={view === "counts" ? "is-active" : ""}
              type="button"
              onClick={() => setView("counts")}
            >
              Stock counts <span>{countTotal}</span>
            </button>
            <button
              role="tab"
              aria-selected={view === "balances"}
              className={view === "balances" ? "is-active" : ""}
              type="button"
              onClick={() => setView("balances")}
            >
              Stock overview <span>{balanceTotal}</span>
            </button>
            <button
              role="tab"
              aria-selected={view === "movements"}
              className={view === "movements" ? "is-active" : ""}
              type="button"
              onClick={() => setView("movements")}
            >
              Movement history <span>{movementTotal}</span>
            </button>
          </div>
          {!warehouseId ? (
            <div className="ui-table-message">
              <strong>Select a warehouse</strong>
              <span>Inventory is managed and counted by warehouse.</span>
            </div>
          ) : view === "counts" ? (
            <>
              <DataTable
                columns={adjustmentColumns}
                rows={adjustments}
                rowKey={(row) => row.id}
                loading={loading}
                emptyTitle="No stock counts yet"
                emptyDescription="Start a physical count to compare the shelf quantity with the current system balance."
              />
              <TablePagination
                page={countPage}
                pageSize={countPageSize}
                total={countTotal}
                loading={loading}
                onPageChange={setCountPage}
                onPageSizeChange={(size) => {
                  setCountPageSize(size);
                  setCountPage(1);
                }}
              />
            </>
          ) : view === "balances" ? (
            <>
              <p className="ui-inline-help">
                On hand includes reserved stock. Available is on hand minus
                reservations; in-transit stock is shown separately.
              </p>
              <DataTable
                columns={balanceColumns}
                rows={balances}
                rowKey={(row) => row.productId}
                loading={loading}
                emptyTitle="No stock balances"
                emptyDescription="Receive stock or post an opening count to create balances."
              />
              <TablePagination
                page={balancePage}
                pageSize={balancePageSize}
                total={balanceTotal}
                loading={loading}
                onPageChange={setBalancePage}
                onPageSizeChange={(size) => {
                  setBalancePageSize(size);
                  setBalancePage(1);
                }}
              />
            </>
          ) : (
            <>
              <DataTable
                columns={movementColumns}
                rows={movements}
                rowKey={(row) => row.id}
                loading={loading}
                emptyTitle="No stock movements"
                emptyDescription="Posted inventory operations will appear here."
              />
              <TablePagination
                page={movementPage}
                pageSize={movementPageSize}
                total={movementTotal}
                loading={loading}
                onPageChange={setMovementPage}
                onPageSizeChange={(size) => {
                  setMovementPageSize(size);
                  setMovementPage(1);
                }}
              />
            </>
          )}
          {loading ? (
            <span className="sr-only" role="status">
              Loading inventory data…
            </span>
          ) : null}
          {warehouses.length === 0 && !loading ? (
            <div className="ui-table-message">
              <strong>Add a warehouse to begin</strong>
              <span>
                Inventory counts and balances are recorded by warehouse.{" "}
                <Link href="/locations">Set up a warehouse</Link>.
              </span>
            </div>
          ) : null}
          {!canWrite ? (
            <p className="ui-inline-help">
              You have view-only inventory access. Contact an organization
              administrator if you need to record counts.
            </p>
          ) : null}
        </section>
      )}
      <Drawer
        open={createOpen}
        title="New stock count"
        description="Saving creates a draft only; inventory changes only after you explicitly post the variance."
        onClose={() => !busy && setCreateOpen(false)}
      >
        <form onSubmit={createCount} className="ui-drawer-form">
          <label htmlFor="stock-count-warehouse">Warehouse</label>
          <select
            id="stock-count-warehouse"
            required
            value={warehouseId}
            onChange={(event) => {
              setCountPage(1);
              setBalancePage(1);
              setMovementPage(1);
              setWarehouseId(event.target.value);
            }}
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
          <label htmlFor="stock-count-product">Product</label>
          <select
            id="stock-count-product"
            required
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Choose a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.sku} · {product.baseUnit.code}
              </option>
            ))}
          </select>
          <label htmlFor="stock-count-quantity">
            Counted quantity{" "}
            {selectedProduct
              ? `(${selectedProduct.baseUnit.name}, ${selectedProduct.baseUnit.code})`
              : ""}
          </label>
          <input
            id="stock-count-quantity"
            required
            inputMode="decimal"
            pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?"
            value={countedQuantity}
            onChange={(event) => setCountedQuantity(event.target.value)}
          />
          <label htmlFor="stock-count-reason">Reason</label>
          <textarea
            id="stock-count-reason"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: monthly shelf count"
          />
          {selectedProduct && countedQuantity ? (
            <p className="ui-inline-help">
              The current system quantity is captured when you save. The
              variance will be shown in the count list.
            </p>
          ) : null}
          <div className="ui-drawer-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !warehouseId || !products.length}
            >
              {busy ? "Saving…" : "Save count draft"}
            </button>
          </div>
        </form>
      </Drawer>
      <Drawer
        open={selectedAdjustment !== null}
        title="Stock count details"
        description="Count quantities are retained as an auditable record."
        onClose={() => setSelectedAdjustment(null)}
      >
        {selectedAdjustment ? (
          <div className="ui-document-summary">
            <dl>
              <dt>Count ID</dt>
              <dd>{selectedAdjustment.id}</dd>
              <dt>Product</dt>
              <dd>
                {products.find(
                  (product) => product.id === selectedAdjustment.productId,
                )?.name ?? selectedAdjustment.productId}
              </dd>
              <dt>Expected quantity</dt>
              <dd>{selectedAdjustment.systemQuantity}</dd>
              <dt>Counted quantity</dt>
              <dd>{selectedAdjustment.countedQuantity}</dd>
              <dt>Variance</dt>
              <dd>
                {subtractQuantities(
                  selectedAdjustment.countedQuantity,
                  selectedAdjustment.systemQuantity,
                )}
              </dd>
              <dt>Reason</dt>
              <dd>{selectedAdjustment.reason}</dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={selectedAdjustment.status} />
              </dd>
              <dt>Recorded</dt>
              <dd>{new Date(selectedAdjustment.createdAt).toLocaleString()}</dd>
            </dl>
            <p className="ui-inline-help">
              Posting creates an immutable movement for the variance.
            </p>
            {selectedAdjustment.status === "DRAFT" && canWrite ? (
              <button
                className="button button-primary"
                type="button"
                disabled={busy}
                onClick={() => setPostTarget(selectedAdjustment)}
              >
                Post variance
              </button>
            ) : null}
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={postTarget !== null}
        title="Post this count variance?"
        description="This updates on-hand stock by the recorded variance and creates an immutable inventory movement. The draft cannot be posted twice."
        confirmLabel="Post variance"
        busy={busy}
        onConfirm={() => postTarget && void postCount(postTarget.id)}
        onCancel={() => setPostTarget(null)}
      />
    </main>
  );
}

export default function InventoryPage() {
  return (
    <ProtectedContent>
      <InventoryManager />
    </ProtectedContent>
  );
}
