"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";
import { DocumentHeader } from "../../../components/documents/document-header";
import { DocumentLayout } from "../../../components/documents/document-layout";
import { DocumentSection } from "../../../components/documents/document-section";
import { DocumentLineItems } from "../../../components/documents/document-line-items";
import { DocumentActions } from "../../../components/documents/document-actions";
import {
  ProductSelector,
  type SelectableProduct,
} from "../../../components/documents/product-selector";
import {
  isAtMostQuantity,
  isPositiveDecimal,
  subtractQuantity,
} from "../../../features/procurement/decimal";

type Warehouse = { id: string; name: string };
type Product = SelectableProduct;
type Line = {
  key: string;
  product: Product | null;
  quantity: string;
  available: string;
  unit: string;
};

export default function NewTransferPage() {
  const router = useRouter();
  const { organization, authenticatedRequest } = useSession();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    {
      key: crypto.randomUUID(),
      product: null,
      quantity: "1",
      available: "",
      unit: "",
    },
  ]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!organization) return;
    void authenticatedRequest<{ data: Warehouse[] }>(
      "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
    )
      .then((result) => {
        setWarehouses(result.data);
        setSource(result.data[0]?.id ?? "");
        setDestination(result.data[1]?.id ?? "");
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Warehouses could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  }, [authenticatedRequest, organization]);

  async function chooseProduct(index: number, product: Product | null) {
    setLines((current) =>
      current.map((line, i) =>
        i === index
          ? {
              ...line,
              product,
              unit: product?.baseUnit.code ?? "",
              available: "",
            }
          : line,
      ),
    );
    if (!product || !source) return;
    try {
      const balance = await authenticatedRequest<{
        data: { onHand: string; reserved: string }[];
      }>(
        `/inventory/warehouses/${source}/balances?page=1&page_size=1&productId=${product.id}`,
      );
      const row = balance.data[0];
      setLines((current) =>
        current.map((line, i) =>
          i === index && line.product?.id === product.id
            ? {
                ...line,
                available: row
                  ? subtractQuantity(row.onHand, row.reserved)
                  : "0",
              }
            : line,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Warehouse availability could not be loaded.",
      );
    }
  }
  async function changeSource(warehouseId: string) {
    setSource(warehouseId);
    setLines((current) => current.map((line) => ({ ...line, available: "" })));
    const selected = lines
      .map((line, index) => ({ product: line.product, index }))
      .filter((item) => item.product);
    try {
      const results = await Promise.all(
        selected.map(async ({ product, index }) => {
          const result = await authenticatedRequest<{
            data: { onHand: string; reserved: string }[];
          }>(
            `/inventory/warehouses/${warehouseId}/balances?page=1&page_size=1&productId=${product!.id}`,
          );
          return { index, id: product!.id, row: result.data[0] };
        }),
      );
      setLines((current) =>
        current.map((line, index) => {
          const result = results.find(
            (item) => item.index === index && item.id === line.product?.id,
          );
          return result
            ? {
                ...line,
                available: result.row
                  ? subtractQuantity(result.row.onHand, result.row.reserved)
                  : "0",
              }
            : line;
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Availability could not be loaded for this warehouse.",
      );
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await authenticatedRequest<{ id: string }>(
        "/organizations/current/inventory/transfers",
        {
          sourceWarehouseId: source,
          destinationWarehouseId: destination,
          note: note || undefined,
          lines: lines.map((line) => ({
            productId: line.product!.id,
            quantity: line.quantity,
          })),
        },
        "POST",
      );
      router.push(`/transfers/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Transfer draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const canWrite = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "BUYER",
    "WAREHOUSE_CLERK",
  ].includes(organization?.role ?? "");
  const valid =
    source &&
    destination &&
    source !== destination &&
    lines.length > 0 &&
    new Set(lines.map((line) => line.product?.id).filter(Boolean)).size ===
      lines.length &&
    lines.every(
      (line) =>
        line.product &&
        line.available !== "" &&
        isPositiveDecimal(line.quantity) &&
        isAtMostQuantity(line.quantity, line.available),
    );
  return (
    <main className="ui-page">
      <DocumentHeader
        eyebrow="INVENTORY OPERATIONS"
        title="New transfer"
        description="Create a draft request to move inventory between warehouses. A draft does not dispatch stock."
        breadcrumbs={[
          { label: "Transfers", href: "/transfers" },
          { label: "New draft" },
        ]}
      />
      {error ? (
        <p role="alert" className="error-banner">
          {error}
        </p>
      ) : null}
      {loading ? (
        <section className="document-section">
          <p>Loading warehouse access…</p>
        </section>
      ) : !canWrite ? (
        <section className="document-section">
          <p>Your role cannot create transfers.</p>
        </section>
      ) : (
        <form onSubmit={save}>
          <DocumentLayout>
            <DocumentSection
              title="Transfer information"
              description="Only warehouses available to your organization can be selected."
            >
              <div className="document-fields">
                <label>
                  Source warehouse
                  <select
                    required
                    value={source}
                    onChange={(event) => void changeSource(event.target.value)}
                  >
                    <option value="">Choose source</option>
                    {warehouses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination warehouse
                  <select
                    required
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <option value="">Choose destination</option>
                    {warehouses
                      .filter((item) => item.id !== source)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="document-field-wide">
                  Notes
                  <input
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>
            </DocumentSection>
            <DocumentLineItems
              title="Transfer items"
              description="Availability is retrieved for the selected source warehouse."
              onAdd={() =>
                setLines((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    product: null,
                    quantity: "1",
                    available: "",
                    unit: "",
                  },
                ])
              }
            >
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Available at source</th>
                  <th>Unit</th>
                  <th>Transfer quantity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.key}>
                    <td>
                      <ProductSelector
                        value={line.product}
                        onSelect={(product) =>
                          void chooseProduct(index, product)
                        }
                      />
                    </td>
                    <td>{line.product ? line.available || "Loading…" : "—"}</td>
                    <td>{line.unit || "—"}</td>
                    <td>
                      <input
                        aria-label="Transfer quantity"
                        required
                        inputMode="decimal"
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
                      {line.product &&
                      line.available !== "" &&
                      isPositiveDecimal(line.quantity) &&
                      !isAtMostQuantity(line.quantity, line.available) ? (
                        <small className="field-error" role="alert">
                          Quantity exceeds available stock ({line.available}).
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ui-quiet-button"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DocumentLineItems>
            {source === destination ? (
              <p role="alert" className="error-banner">
                Choose different source and destination warehouses.
              </p>
            ) : null}
            {warehouses.length < 2 ? (
              <p className="panel-message">
                At least two accessible active warehouses are required.
              </p>
            ) : null}
            <DocumentActions cancelHref="/transfers" busy={busy}>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || loading || !valid}
              >
                {busy ? "Saving…" : "Create draft"}
              </button>
            </DocumentActions>
          </DocumentLayout>
        </form>
      )}
    </main>
  );
}
