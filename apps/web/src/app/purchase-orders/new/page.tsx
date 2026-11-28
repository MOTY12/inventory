"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../features/auth/session-provider";
import {
  formatDecimal,
  isPositiveDecimal,
  sumLineAmounts,
} from "../../../features/procurement/decimal";
import { DocumentHeader } from "../../../components/documents/document-header";
import { DocumentLayout } from "../../../components/documents/document-layout";
import { DocumentSection } from "../../../components/documents/document-section";
import { DocumentLineItems } from "../../../components/documents/document-line-items";
import { DocumentSummary } from "../../../components/documents/document-summary";
import { DocumentActions } from "../../../components/documents/document-actions";
import {
  ProductSelector,
  type SelectableProduct,
} from "../../../components/documents/product-selector";
import {
  EntitySelector,
  type SelectableEntity,
} from "../../../components/documents/entity-selector";

type Product = SelectableProduct & {
  unitConversions: NonNullable<SelectableProduct["unitConversions"]>;
};
type Line = {
  key: string;
  product: Product | null;
  unitId: string;
  quantity: string;
  unitCost: string;
};
export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { organization, authenticatedRequest } = useSession();
  const [supplier, setSupplier] = useState<SelectableEntity | null>(null);
  const [warehouse, setWarehouse] = useState<SelectableEntity | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState("");
  const [lines, setLines] = useState<Line[]>([
    {
      key: crypto.randomUUID(),
      product: null,
      unitId: "",
      quantity: "1",
      unitCost: "0",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amount = useMemo(
    () =>
      sumLineAmounts(
        lines
          .filter((line) => line.product)
          .map(({ quantity, unitCost }) => ({ quantity, unitCost })),
      ),
    [lines],
  );
  function updateLine(index: number, changes: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...changes } : line)),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!supplier || !warehouse) {
      setError("Select a supplier and receiving warehouse before saving.");
      return;
    }
    if (!lines.length || lines.some((line) => !line.product || !line.unitId)) {
      setError("Add at least one product and unit before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await authenticatedRequest<{ id: string }>(
        "/organizations/current/procurement/purchase-orders",
        {
          supplierId: supplier!.id,
          warehouseId: warehouse!.id,
          currency,
          expectedDeliveryAt: expectedDeliveryAt || undefined,
          lines: lines.map((line) => ({
            productId: line.product?.id,
            unitId: line.unitId,
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
        },
        "POST",
      );
      router.push(`/purchase-orders/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
    organization?.role ?? "",
  );
  const valid =
    supplier &&
    warehouse &&
    /^[A-Z]{3}$/.test(currency) &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.product &&
        line.unitId &&
        /^\d+(\.\d{1,6})?$/.test(line.quantity) &&
        isPositiveDecimal(line.quantity) &&
        /^\d+(\.\d{1,4})?$/.test(line.unitCost),
    );

  return (
    <main className="ui-page">
      <DocumentHeader
        eyebrow="PURCHASING"
        title="New purchase order"
        description="Create a draft for supplier goods. Inventory changes only when goods are received."
        breadcrumbs={[
          { label: "Purchase orders", href: "/purchase-orders" },
          { label: "New draft" },
        ]}
      />
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {!canWrite ? (
        <section className="document-section">
          <p>Your role cannot create purchase orders.</p>
        </section>
      ) : (
        <form onSubmit={save}>
          <DocumentLayout
            aside={
              <DocumentSummary
                rows={[
                  { label: "Currency", value: currency },
                  {
                    label: "Lines",
                    value: lines.filter((line) => line.product).length,
                  },
                ]}
                total={{ label: "Order value", value: `${currency} ${amount}` }}
              />
            }
          >
            <DocumentSection
              title="Supplier and destination"
              description="Choose the supplier and receiving warehouse."
            >
              <div className="document-fields">
                <EntitySelector
                  endpoint="/organizations/current/procurement/suppliers"
                  label="Supplier"
                  value={supplier}
                  onSelect={setSupplier}
                  required
                  searchHint="Search suppliers by name, contact or email"
                />
                <EntitySelector
                  endpoint="/organizations/current/warehouses"
                  label="Receiving warehouse"
                  value={warehouse}
                  onSelect={setWarehouse}
                  required
                  searchHint="Search accessible warehouses"
                />
              </div>
            </DocumentSection>
            <DocumentSection title="Order information">
              <div className="document-fields">
                <label>
                  Currency
                  <input
                    required
                    maxLength={3}
                    pattern="[A-Z]{3}"
                    value={currency}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                  />
                </label>
                <label>
                  Expected delivery
                  <input
                    type="date"
                    value={expectedDeliveryAt}
                    onChange={(event) =>
                      setExpectedDeliveryAt(event.target.value)
                    }
                  />
                </label>
              </div>
            </DocumentSection>
            <DocumentLineItems
              title="Order items"
              description="Search the active catalog by product name, SKU, or barcode."
              onAdd={() =>
                setLines((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    product: null,
                    unitId: "",
                    quantity: "1",
                    unitCost: "0",
                  },
                ])
              }
            >
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Unit cost</th>
                  <th>Line total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const units = line.product
                    ? [
                        line.product.baseUnit,
                        ...(line.product.unitConversions ?? []).map(
                          (item) => item.unit,
                        ),
                      ]
                    : [];
                  return (
                    <tr key={line.key}>
                      <td>
                        <ProductSelector
                          value={line.product}
                          onSelect={(selected) => {
                            const product = selected as Product | null;
                            updateLine(index, {
                              product,
                              unitId: product?.baseUnit.id ?? "",
                            });
                          }}
                        />
                      </td>
                      <td>
                        <select
                          aria-label="Unit"
                          required
                          value={line.unitId}
                          disabled={!line.product}
                          onChange={(event) =>
                            updateLine(index, { unitId: event.target.value })
                          }
                        >
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.code}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label="Quantity"
                          required
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(index, { quantity: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label="Unit cost"
                          required
                          inputMode="decimal"
                          value={line.unitCost}
                          onChange={(event) =>
                            updateLine(index, { unitCost: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        {currency}{" "}
                        {line.product
                          ? formatDecimal(
                              sumLineAmounts([
                                {
                                  quantity: line.quantity,
                                  unitCost: line.unitCost,
                                },
                              ]),
                            )
                          : "0.0000"}
                      </td>
                      <td>
                        <button
                          className="ui-quiet-button"
                          type="button"
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
                  );
                })}
              </tbody>
            </DocumentLineItems>
            <DocumentActions cancelHref="/purchase-orders" busy={busy}>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || !valid}
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
            </DocumentActions>
          </DocumentLayout>
        </form>
      )}
    </main>
  );
}
