"use client";

import { useRef, useState } from "react";
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
  EntitySelector,
  type SelectableEntity,
} from "../../../components/documents/entity-selector";
import {
  isAtMostQuantity,
  isPositiveDecimal,
  subtractQuantity,
} from "../../../features/procurement/decimal";

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
  const [source, setSource] = useState<SelectableEntity | null>(null);
  const [destination, setDestination] = useState<SelectableEntity | null>(null);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const warehouseGeneration = useRef(0);

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
    const warehouseId = source?.id;
    const generation = warehouseGeneration.current;
    if (!product || !warehouseId) return;
    try {
      const balance = await authenticatedRequest<{
        data: { onHand: string; reserved: string }[];
      }>(
        `/inventory/warehouses/${warehouseId}/balances?page=1&page_size=1&productId=${product.id}`,
      );
      if (generation !== warehouseGeneration.current) return;
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
  async function changeSource(selectedWarehouse: SelectableEntity | null) {
    const generation = ++warehouseGeneration.current;
    setSource(selectedWarehouse);
    if (destination?.id === selectedWarehouse?.id) setDestination(null);
    setLines((current) => current.map((line) => ({ ...line, available: "" })));
    const productsToRefresh = lines
      .map((line, index) => ({ product: line.product, index }))
      .filter((item) => item.product);
    try {
      if (!selectedWarehouse) return;
      const results = await Promise.all(
        productsToRefresh.map(async ({ product, index }) => {
          const result = await authenticatedRequest<{
            data: { onHand: string; reserved: string }[];
          }>(
            `/inventory/warehouses/${selectedWarehouse.id}/balances?page=1&page_size=1&productId=${product!.id}`,
          );
          return { index, id: product!.id, row: result.data[0] };
        }),
      );
      if (generation !== warehouseGeneration.current) return;
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
    if (!source || !destination || source.id === destination.id) {
      setError("Select different source and destination warehouses.");
      return;
    }
    if (!lines.length || lines.some((line) => !line.product)) {
      setError("Add at least one product before saving the transfer.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await authenticatedRequest<{ id: string }>(
        "/organizations/current/inventory/transfers",
        {
          sourceWarehouseId: source!.id,
          destinationWarehouseId: destination!.id,
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
    source.id !== destination.id &&
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
      {!canWrite ? (
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
                <EntitySelector
                  endpoint="/organizations/current/warehouses"
                  label="Source warehouse"
                  value={source}
                  onSelect={(selected) => void changeSource(selected)}
                  required
                  searchHint="Search accessible source warehouses"
                />
                <EntitySelector
                  endpoint="/organizations/current/warehouses"
                  label="Destination warehouse"
                  value={destination}
                  onSelect={setDestination}
                  required
                  excludeIds={source ? [source.id] : []}
                  searchHint="Search accessible destination warehouses"
                />
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
            {source && destination && source.id === destination.id ? (
              <p role="alert" className="error-banner">
                Choose different source and destination warehouses.
              </p>
            ) : null}
            <DocumentActions cancelHref="/transfers" busy={busy}>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || !valid}
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
