"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { BarcodeScanner } from "../../../components/barcode/barcode-scanner";
import {
  addQuantities,
  divideQuantityExact,
  matchesQuantityPrecision,
} from "../../../features/procurement/decimal";
import { useSession } from "../../../features/auth/session-provider";
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

type UnitOption = {
  id: string;
  code: string;
  name: string;
  precision?: number;
};
type ProductConversion = {
  unitId: string;
  baseQuantity: string;
  unit: UnitOption;
};
type Product = SelectableProduct & {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  defaultSalePrice: string | null;
  saleCurrency: string | null;
  type: string;
  trackInventory: boolean;
  baseUnit: UnitOption;
  unitConversions: ProductConversion[];
};
type Balance = { productId: string; onHand: string; reserved: string };
type Line = {
  id: string;
  productId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};
const salesApi = "/organizations/current/sales/orders";

function scaled(value: string, places: number) {
  if (!/^\d+(\.\d*)?$/.test(value)) return BigInt(0);
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(places) +
    BigInt((fraction + "0".repeat(places)).slice(0, places))
  );
}
function display(value: bigint, places: number) {
  const scale = BigInt(10) ** BigInt(places);
  const whole = value / scale;
  const fraction = String(value % scale)
    .padStart(places, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
function lineTotal(line: Line) {
  const unrounded = scaled(line.quantity, 6) * scaled(line.unitPrice, 4);
  return (unrounded + BigInt(500_000)) / BigInt(1_000_000);
}

export default function NewSalesOrderPage() {
  const router = useRouter();
  const { organization, authenticatedRequest } = useSession();
  const organizationIdRef = useRef(organization?.id ?? "");
  useLayoutEffect(() => {
    organizationIdRef.current = organization?.id ?? "";
  }, [organization?.id]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [customer, setCustomer] = useState<SelectableEntity | null>(null);
  const [warehouse, setWarehouse] = useState<SelectableEntity | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expectedFulfillmentAt, setExpectedFulfillmentAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    {
      id: crypto.randomUUID(),
      productId: "",
      unitId: "",
      quantity: "1",
      unitPrice: "0",
    },
  ]);
  const selectedProductIds = lines.map((line) => line.productId).join(",");
  const linesRef = useRef(lines);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const key = useRef(`sales-order-create-${crypto.randomUUID()}`);
  const balanceGeneration = useRef(0);

  const loadBalances = useCallback(async () => {
    const generation = ++balanceGeneration.current;
    const warehouseId = warehouse?.id;
    if (!warehouseId) {
      setBalances({});
      return;
    }
    setAvailabilityError("");
    try {
      const ids = [
        ...new Set(
          linesRef.current.map((line) => line.productId).filter(Boolean),
        ),
      ];
      const results = await Promise.all(
        ids.map((productId) =>
          authenticatedRequest<{ data: Balance[] }>(
            `/inventory/warehouses/${warehouseId}/balances?page=1&page_size=1&productId=${productId}`,
          ),
        ),
      );
      if (
        generation !== balanceGeneration.current ||
        organizationIdRef.current !== (organization?.id ?? "") ||
        warehouseId !== warehouse?.id
      )
        return;
      setBalances(
        Object.fromEntries(
          results.flatMap((result) =>
            result.data.map((balance) => [balance.productId, balance]),
          ),
        ),
      );
    } catch (cause) {
      if (generation !== balanceGeneration.current) return;
      setBalances({});
      setAvailabilityError(
        cause instanceof Error
          ? cause.message
          : "Availability could not be loaded.",
      );
    }
  }, [authenticatedRequest, organization, warehouse]);
  useEffect(() => {
    void Promise.resolve().then(loadBalances);
  }, [loadBalances, selectedProductIds]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), BigInt(0)),
    [lines],
  );
  function updateLines(update: (current: Line[]) => Line[]) {
    const next = update(linesRef.current);
    linesRef.current = next;
    setLines(next);
  }
  function updateLine(index: number, changes: Partial<Line>) {
    updateLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...changes };
        if (changes.productId) {
          const product = products.find((row) => row.id === changes.productId);
          next.unitId = product?.baseUnit.id ?? "";
          next.unitPrice = product?.defaultSalePrice ?? "0";
          if (product?.saleCurrency) setCurrency(product.saleCurrency);
        }
        return next;
      }),
    );
  }
  function selectProduct(index: number, selected: SelectableProduct | null) {
    const product = selected as Product | null;
    if (product)
      setProducts((current) => [
        ...current.filter((item) => item.id !== product.id),
        product,
      ]);
    updateLine(index, {
      productId: product?.id ?? "",
      unitId: product?.baseUnit.id ?? "",
      unitPrice: product?.defaultSalePrice ?? "0",
    });
    if (product?.saleCurrency) setCurrency(product.saleCurrency);
  }
  function availability(line: Line) {
    const balance = balances[line.productId];
    if (!balance) return "0";
    return display(scaled(balance.onHand, 6) - scaled(balance.reserved, 6), 6);
  }
  async function addScannedProduct(barcode: string) {
    const scannedOrganizationId = organization?.id;
    const product = await authenticatedRequest<Product>(
      `/organizations/current/catalog/products/by-barcode?barcode=${encodeURIComponent(barcode)}`,
    );
    if (
      !scannedOrganizationId ||
      organizationIdRef.current !== scannedOrganizationId
    ) {
      throw new Error("Workspace changed; scan the barcode again.");
    }
    if (product.type !== "STOCKED" || !product.trackInventory)
      throw new Error("This barcode is not an active stocked product.");

    const currentLine = linesRef.current.find(
      (line) => line.productId === product.id,
    );
    let nextQuantity = "1";
    let unitCode = product.baseUnit.code;
    if (currentLine) {
      const conversion = product.unitConversions.find(
        (item) => item.unitId === currentLine.unitId,
      );
      const increment =
        currentLine.unitId === product.baseUnit.id
          ? "1"
          : conversion
            ? divideQuantityExact("1", conversion.baseQuantity)
            : null;
      const unit = conversion?.unit ?? product.baseUnit;
      if (
        !increment ||
        !matchesQuantityPrecision(increment, unit.precision ?? 0)
      )
        throw new Error(
          `One base unit cannot be represented in ${unit.code}; change the order line to a compatible unit before scanning.`,
        );
      nextQuantity = addQuantities(currentLine.quantity, increment);
      unitCode = unit.code;
      updateLines((current) =>
        current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: nextQuantity }
            : line,
        ),
      );
    } else {
      updateLines((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          unitId: product.baseUnit.id,
          quantity: "1",
          unitPrice: product.defaultSalePrice ?? "0",
        },
      ]);
    }
    if (product.saleCurrency) setCurrency(product.saleCurrency);
    return {
      productName: product.name,
      sku: product.sku,
      quantity: nextQuantity,
      unitCode,
    };
  }
  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!customer || !warehouse) {
      setError("Select a customer and fulfillment warehouse before saving.");
      return;
    }
    if (
      !lines.length ||
      lines.some((line) => !line.productId || !line.unitId)
    ) {
      setError("Add at least one complete product line before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await authenticatedRequest<{ id: string }>(
        salesApi,
        {
          customerId: customer!.id,
          warehouseId: warehouse!.id,
          currency,
          orderDate,
          expectedFulfillmentAt: expectedFulfillmentAt || undefined,
          notes: notes || undefined,
          lines: lines.map(({ productId, unitId, quantity, unitPrice }) => ({
            productId,
            unitId: unitId || undefined,
            quantity,
            unitPrice,
          })),
        },
        "POST",
        { "Idempotency-Key": key.current },
      );
      router.push(`/sales-orders/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const canWrite = ["OWNER", "ADMIN", "MANAGER", "SALES"].includes(
    organization?.role ?? "",
  );

  return (
    <main className="page-content">
      <DocumentHeader
        eyebrow="SALES"
        title="New sales order"
        description="Save a draft first. Stock is reserved only when you confirm it."
        breadcrumbs={[
          { label: "Sales orders", href: "/sales-orders" },
          { label: "New draft" },
        ]}
      />
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {availabilityError && (
        <p className="error-banner" role="alert">
          {availabilityError}
        </p>
      )}
      {!canWrite ? (
        <section className="panel">
          <p>Your role can view sales orders but cannot create them.</p>
        </section>
      ) : (
        <form className="order-editor" onSubmit={saveDraft}>
          <DocumentLayout
            aside={
              <DocumentSummary
                rows={[
                  { label: "Currency", value: currency },
                  {
                    label: "Lines",
                    value: lines.filter((line) => line.productId).length,
                  },
                ]}
                total={{
                  label: "Subtotal",
                  value: `${currency} ${display(subtotal, 4)}`,
                }}
              />
            }
          >
            <DocumentSection title="Customer and order details">
              <div className="form-grid">
                <EntitySelector
                  endpoint="/organizations/current/sales/customers"
                  label="Customer"
                  value={customer}
                  onSelect={setCustomer}
                  required
                  searchHint="Search customers by name, contact or email"
                />
                <EntitySelector
                  endpoint="/organizations/current/warehouses"
                  label="Fulfillment warehouse"
                  value={warehouse}
                  onSelect={(selected) => {
                    setWarehouse(selected);
                    setBalances({});
                    setAvailabilityError("");
                  }}
                  required
                  searchHint="Search accessible warehouses"
                />
                <label>
                  Order date
                  <input
                    required
                    type="date"
                    value={orderDate}
                    onChange={(event) => setOrderDate(event.target.value)}
                  />
                </label>
                <label>
                  Expected fulfillment
                  <input
                    type="date"
                    value={expectedFulfillmentAt}
                    onChange={(event) =>
                      setExpectedFulfillmentAt(event.target.value)
                    }
                  />
                </label>
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
                  Notes
                  <input
                    maxLength={1000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            </DocumentSection>
            <DocumentSection
              title="Products"
              description="Availability is live for the selected warehouse. Confirmation reserves the base-unit quantity."
            >
              <BarcodeScanner onScan={addScannedProduct} />
              <DocumentLineItems
                title="Order items"
                description="Search by product name, SKU, or barcode."
                onAdd={() =>
                  updateLines((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      productId: "",
                      unitId: "",
                      quantity: "1",
                      unitPrice: "0",
                    },
                  ])
                }
              >
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Available</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Line total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const product = products.find(
                      (row) => row.id === line.productId,
                    );
                    const units = product
                      ? [
                          product.baseUnit,
                          ...product.unitConversions.map(
                            (conversion) => conversion.unit,
                          ),
                        ]
                      : [];
                    return (
                      <tr key={line.id}>
                        <td>
                          <ProductSelector
                            value={product ?? null}
                            onSelect={(selected) =>
                              selectProduct(index, selected)
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label="Unit"
                            value={line.unitId}
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
                          {availability(line)} {product?.baseUnit.code}
                        </td>
                        <td>
                          <input
                            aria-label="Quantity"
                            required
                            min="0.000001"
                            step="any"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(index, {
                                quantity: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label="Unit price"
                            required
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(event) =>
                              updateLine(index, {
                                unitPrice: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          {currency} {display(lineTotal(line), 4)}
                        </td>
                        <td>
                          <button
                            className="button button-secondary"
                            type="button"
                            aria-label="Remove product"
                            disabled={lines.length === 1}
                            onClick={() =>
                              updateLines((current) =>
                                current.filter(
                                  (_, lineIndex) => lineIndex !== index,
                                ),
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
              <p className="panel-message">
                Draft creation does not reserve or deduct inventory.
              </p>
            </DocumentSection>
            <DocumentActions cancelHref="/sales-orders" busy={busy}>
              <p>
                Drafts do not reserve stock. Confirming this order will reserve
                all listed quantities atomically.
              </p>
              <button
                className="button button-primary"
                type="submit"
                disabled={
                  busy ||
                  !customer ||
                  !warehouse ||
                  !lines.every((line) => line.productId && line.unitId)
                }
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
