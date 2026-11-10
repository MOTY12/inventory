"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../features/auth/session-provider";

type Page<T> = { data: T[]; total: number };
type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string };
type Balance = { onHand: string; reserved: string; product: Product };
type Movement = {
  id: string;
  movementType: string;
  quantityDelta: string;
  occurredAt: string;
  product: Product;
};
type Order = {
  id: string;
  number: string;
  status: string;
  supplier: { name: string };
  subtotal: string;
  currency: string;
};
type LowStockResult = {
  data: {
    id: string;
    product: { name: string; sku: string };
    warehouse: { name: string };
    availableQuantity: string;
    minimumQuantity: string;
  }[];
  total: number;
  summary: { products: number; warehouses: number };
};

function Dashboard() {
  const { organization, user, authenticatedRequest } = useSession();
  const [products, setProducts] = useState<Page<Product> | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [balanceCount, setBalanceCount] = useState(0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lowStock, setLowStock] = useState<LowStockResult>({
    data: [],
    total: 0,
    summary: { products: 0, warehouses: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organization) {
      setProducts(null);
      setWarehouses([]);
      setOrders([]);
      setBalances([]);
      setBalanceCount(0);
      setMovements([]);
      setLoading(false);
      return;
    }
    setProducts(null);
    setWarehouses([]);
    setOrders([]);
    setBalances([]);
    setBalanceCount(0);
    setMovements([]);
    setLoading(true);
    setError("");
    try {
      const [productResult, warehouseResult, orderResult, lowStockResult] =
        await Promise.all([
          authenticatedRequest<Page<Product>>(
            "/organizations/current/catalog/products?page=1&page_size=1&status=ACTIVE",
          ),
          authenticatedRequest<Page<Warehouse>>(
            "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
          ),
          authenticatedRequest<Page<Order>>(
            "/organizations/current/procurement/purchase-orders?page=1&page_size=5",
          ),
          authenticatedRequest<LowStockResult>(
            "/organizations/current/inventory/low-stock?page=1&page_size=5",
          ),
        ]);
      setProducts(productResult);
      setWarehouses(warehouseResult.data);
      setOrders(orderResult.data);
      setLowStock(lowStockResult);
      const stock = await Promise.all(
        warehouseResult.data.map(async (warehouse) => {
          const [balanceResult, movementResult] = await Promise.all([
            authenticatedRequest<Page<Balance>>(
              `/inventory/warehouses/${warehouse.id}/balances?page=1&page_size=100`,
            ),
            authenticatedRequest<Page<Movement>>(
              `/inventory/warehouses/${warehouse.id}/movements?page=1&page_size=5`,
            ),
          ]);
          return {
            balances: balanceResult.data,
            balanceCount: balanceResult.total,
            movements: movementResult.data,
          };
        }),
      );
      setBalances(stock.flatMap((item) => item.balances));
      setBalanceCount(
        stock.reduce((total, item) => total + item.balanceCount, 0),
      );
      setMovements(
        stock
          .flatMap((item) => item.movements)
          .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
          .slice(0, 8),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Dashboard information could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest, organization]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const firstName = user?.email.split("@")[0] ?? "there";
  const hasStarted = (products?.total ?? 0) > 0 || warehouses.length > 0;

  return (
    <ProtectedContent>
      <div className="dashboard-page">
        <header className="dashboard-heading">
          <div>
            <p className="eyebrow">YOUR OPERATIONS, IN ONE PLACE</p>
            <h1>Good day, {firstName}</h1>
            <p className="page-description">
              A clear view of {organization?.name ?? "your workspace"} and what
              needs attention.
            </p>
          </div>
          <div className="dashboard-actions">
            <Link className="button button-secondary" href="/inventory">
              Record stock count
            </Link>
            <Link className="button button-primary" href="/products">
              ＋ Add product
            </Link>
          </div>
        </header>
        {error && (
          <div className="inline-alert" role="alert">
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
        {!organization ? (
          <section className="onboarding-card">
            <span className="onboarding-step">START HERE</span>
            <h2>Set up your workspace</h2>
            <p>
              Create or select an organization, add a warehouse, then register
              your products to begin tracking stock.
            </p>
            <Link className="button button-primary" href="/organizations">
              Set up workspace <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : !loading && !hasStarted ? (
          <section className="onboarding-card">
            <span className="onboarding-step">A FEW STEPS TO GET STARTED</span>
            <h2>Let’s get your stockroom ready</h2>
            <p>
              Start with a warehouse and product list. You can record opening
              quantities as you add stock.
            </p>
            <div className="onboarding-steps">
              <Link href="/locations">
                <span>01</span>
                <strong>Add a warehouse</strong>
                <small>Create a place to store stock</small>
              </Link>
              <Link href="/catalog">
                <span>02</span>
                <strong>Set up units</strong>
                <small>Choose the units you buy and count</small>
              </Link>
              <Link href="/products">
                <span>03</span>
                <strong>Add products</strong>
                <small>Build your product directory</small>
              </Link>
            </div>
            <Link className="button button-primary" href="/locations">
              Begin setup <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : (
          <>
            <section aria-label="Workspace metrics" className="metric-grid">
              <article className="metric-card">
                <span>Active products</span>
                <strong>{loading ? "—" : (products?.total ?? 0)}</strong>
                <small>In your product directory</small>
              </article>
              <article className="metric-card">
                <span>Tracked balances</span>
                <strong>{loading ? "—" : balanceCount}</strong>
                <small>Product and warehouse pairs</small>
              </article>
              <article className="metric-card">
                <span>Warehouses</span>
                <strong>{loading ? "—" : warehouses.length}</strong>
                <small>Active stock locations</small>
              </article>
              <article className="metric-card">
                <span>Open purchase orders</span>
                <strong>
                  {loading
                    ? "—"
                    : orders.filter((order) =>
                        ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"].includes(
                          order.status,
                        ),
                      ).length}
                </strong>
                <small>Draft, submitted or receiving</small>
              </article>
              <article className="metric-card">
                <span>Low-stock alerts</span>
                <strong>{loading ? "—" : lowStock.total}</strong>
                <small>Configured rules below minimum</small>
              </article>
              <article className="metric-card">
                <span>Products requiring attention</span>
                <strong>{loading ? "—" : lowStock.summary.products}</strong>
                <small>Distinct products below minimum</small>
              </article>
              <article className="metric-card">
                <span>Warehouses affected</span>
                <strong>{loading ? "—" : lowStock.summary.warehouses}</strong>
                <small>
                  <Link href="/inventory/low-stock">View low-stock alerts</Link>
                </small>
              </article>
            </section>
            <div className="dashboard-columns">
              <section className="dashboard-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Low stock</h2>
                    <p>Configured rules only; incoming stock is excluded</p>
                  </div>
                  <Link href="/inventory/low-stock">View alerts →</Link>
                </div>
                {loading ? (
                  <p className="panel-message">Loading alerts…</p>
                ) : lowStock.data.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Warehouse</th>
                          <th>Available</th>
                          <th>Minimum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStock.data.map((alert) => (
                          <tr key={alert.id}>
                            <td>
                              {alert.product.name}
                              <small>{alert.product.sku}</small>
                            </td>
                            <td>{alert.warehouse.name}</td>
                            <td>{alert.availableQuantity}</td>
                            <td>{alert.minimumQuantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="panel-message">
                    No products are below a configured reorder threshold.
                  </p>
                )}
              </section>
              <section className="dashboard-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent stock movements</h2>
                    <p>Latest recorded inventory changes</p>
                  </div>
                  <Link href="/inventory">View stock counts →</Link>
                </div>
                {loading ? (
                  <p className="panel-message">Loading movements…</p>
                ) : movements.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Movement</th>
                          <th>Change</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((movement) => (
                          <tr key={movement.id}>
                            <td>
                              <strong>{movement.product.name}</strong>
                              <small>{movement.product.sku}</small>
                            </td>
                            <td>
                              {movement.movementType.replaceAll("_", " ")}
                            </td>
                            <td
                              className={
                                movement.quantityDelta.startsWith("-")
                                  ? "quantity-negative"
                                  : "quantity-positive"
                              }
                            >
                              {movement.quantityDelta}
                            </td>
                            <td>
                              {new Date(
                                movement.occurredAt,
                              ).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No movements yet</strong>
                    <p>
                      Stock activity will appear here after your first receipt
                      or count.
                    </p>
                    <Link href="/inventory">Record a stock count →</Link>
                  </div>
                )}
              </section>
              <section className="dashboard-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Purchasing activity</h2>
                    <p>Recent purchase orders</p>
                  </div>
                  <Link href="/purchase-orders">View all →</Link>
                </div>
                {loading ? (
                  <p className="panel-message">Loading purchase orders…</p>
                ) : orders.length ? (
                  <div className="order-list">
                    {orders.slice(0, 5).map((order) => (
                      <Link
                        href={`/purchase-orders/${order.id}`}
                        key={order.id}
                      >
                        <span>
                          <strong>{order.number}</strong>
                          <small>{order.supplier.name}</small>
                        </span>
                        <span className="order-meta">
                          <b>{order.status.replaceAll("_", " ")}</b>
                          <small>
                            {order.currency} {order.subtotal}
                          </small>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No purchase orders yet</strong>
                    <p>Create an order to track incoming stock.</p>
                    <Link href="/purchase-orders">Create purchase order →</Link>
                  </div>
                )}
              </section>
            </div>
            <section className="dashboard-panel attention-panel">
              <div className="panel-heading">
                <div>
                  <h2>Products to review</h2>
                  <p>Stock quantities by warehouse</p>
                </div>
                <Link href="/products">Open products →</Link>
              </div>
              {loading ? (
                <p className="panel-message">Loading balances…</p>
              ) : balances.length ? (
                <div className="balance-chips">
                  {balances.slice(0, 10).map((balance, index) => (
                    <div key={`${balance.product.id}-${index}`}>
                      <span>
                        <strong>{balance.product.name}</strong>
                        <small>{balance.product.sku}</small>
                      </span>
                      <b>{balance.onHand} on hand</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No stock balances recorded</strong>
                  <p>
                    Products and stock levels will be shown here once stock is
                    recorded.
                  </p>
                  <Link href="/inventory">Record a count →</Link>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ProtectedContent>
  );
}

export default function HomePage() {
  return <Dashboard />;
}
