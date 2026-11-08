"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

type Kind = "PRODUCTS" | "OPENING_BALANCES";
type Field = { key: string; required: boolean };
type Preview = {
  id: string;
  kind: Kind;
  status: "PREVIEWED" | "COMMITTED";
  headers: string[];
  fields: Field[];
  summary: {
    rowCount: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    openingTotalsByProductWarehouse: {
      sku: string;
      warehouseCode: string;
      quantity: string;
      unit: string;
    }[];
  };
  previewRows: {
    rowId: string;
    rowNumber: number;
    sku: string;
    name?: string;
    warehouseCode?: string;
    quantity?: string;
    errors: string[];
  }[];
};
type Batch = {
  id: string;
  kind: Kind;
  status: string;
  fileName: string;
  createdAt: string;
  committedAt: string | null;
  summary: Preview["summary"];
};
type BatchDetail = Batch & {
  previewRows: Preview["previewRows"];
  events: {
    id: string;
    action: string;
    occurredAt: string;
    actor: { email: string };
    metadata: Record<string, unknown>;
  }[];
};

const templates: Record<Kind, string> = {
  PRODUCTS:
    "SKU,Product Name,Description,Barcode,Category,Base Unit,Selling Price,Sale Currency,Cost,Cost Currency,Status\nSKU-001,Sample item,Optional description,,General,PCS,2500.00,NGN,1200.00,NGN,ACTIVE\n",
  OPENING_BALANCES:
    "SKU,Warehouse Code,Opening Quantity,Opening Unit Cost,Cost Currency,Source Reference\nSKU-001,MAIN-01,25,1200.00,NGN,Opening stock count\n",
};
const labels: Record<string, string> = {
  sku: "SKU",
  name: "Product name",
  description: "Description",
  barcode: "Barcode",
  category: "Category",
  baseUnit: "Base unit",
  defaultSalePrice: "Sale price",
  saleCurrency: "Sale currency",
  defaultCost: "Default cost",
  costCurrency: "Cost currency",
  status: "Status",
  warehouseCode: "Warehouse code",
  quantity: "Opening quantity",
  unitCost: "Opening unit cost",
  currency: "Cost currency",
  reference: "Source reference",
};
const endpoint = "/organizations/current/imports";

function errorColumn(error: string, mapping: Record<string, string>) {
  const message = error.toLocaleLowerCase("en-US");
  const fieldAliases: Record<string, string[]> = {
    sku: ["sku"],
    name: ["name", "product name"],
    description: ["description"],
    barcode: ["barcode"],
    category: ["category"],
    baseUnit: ["base unit"],
    defaultSalePrice: ["selling price", "sale price"],
    saleCurrency: ["sale currency"],
    costCurrency: ["cost currency"],
    defaultCost: ["default cost", "cost"],
    status: ["status"],
    warehouseCode: ["warehouse"],
    quantity: ["quantity", "opening stock"],
    unitCost: ["unit cost"],
    currency: ["currency"],
    reference: ["reference", "source"],
  };
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    if (mapping[field] && aliases.some((alias) => message.includes(alias)))
      return mapping[field];
  }
  return null;
}

export default function ImportsPage() {
  const { organization, authenticatedRequest } = useSession();
  const [kind, setKind] = useState<Kind>("PRODUCTS");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite =
    kind === "PRODUCTS"
      ? ["OWNER", "ADMIN", "MANAGER", "BUYER"].includes(
          organization?.role ?? "",
        )
      : ["OWNER", "ADMIN", "MANAGER", "WAREHOUSE_CLERK"].includes(
          organization?.role ?? "",
        );

  const load = useCallback(async () => {
    if (!organization) return;
    try {
      setBatches(await authenticatedRequest<Batch[]>(endpoint));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load import history.",
      );
    }
  }, [authenticatedRequest, organization]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function selectFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setError("");
    setNotice("");
    if (!next) {
      setHeaders([]);
      setMapping({});
      return;
    }
    void next
      .text()
      .then((text) => {
        const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
        const cols = first
          .split(",")
          .map((part) => part.trim().replace(/^"|"$/g, ""));
        setHeaders(cols);
        const aliases: Record<string, string[]> = {
          sku: ["sku", "product sku"],
          name: ["product name", "name", "item name"],
          description: ["description", "details"],
          barcode: ["barcode", "upc", "ean"],
          category: ["category", "product category"],
          baseUnit: ["base unit", "unit", "uom", "unit of measure"],
          defaultSalePrice: [
            "selling price",
            "sale price",
            "default sale price",
          ],
          saleCurrency: ["sale currency", "currency"],
          defaultCost: ["cost", "unit cost", "default cost"],
          costCurrency: ["cost currency"],
          status: ["status", "active status"],
          warehouseCode: ["warehouse code", "warehouse"],
          quantity: ["opening quantity", "quantity", "opening stock"],
          unitCost: ["opening unit cost", "unit cost", "cost"],
          currency: ["cost currency", "currency"],
          reference: ["source", "reference", "source reference"],
        };
        const normalized = cols.map((x) => x.toLocaleLowerCase("en-US"));
        const nextMap: Record<string, string> = {};
        for (const [target, values] of Object.entries(aliases)) {
          const index = values.findIndex((value) => normalized.includes(value));
          if (index >= 0)
            nextMap[target] = cols[normalized.indexOf(values[index])];
        }
        setMapping(nextMap);
      })
      .catch(() => setError("Could not read this CSV file."));
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function previewCsv() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    body.append("mapping", JSON.stringify(mapping));
    await run(async () => {
      const result = await authenticatedRequest<Preview>(
        `${endpoint}/${kind === "PRODUCTS" ? "products" : "opening-balances"}/preview`,
        body,
        "POST",
      );
      setPreview(result);
      await load();
    }, "Preview created. Review every row before committing.");
  }
  async function commit() {
    if (
      !preview ||
      preview.summary.invalidRows !== 0 ||
      preview.summary.rowCount === 0
    )
      return;
    await run(async () => {
      const result = await authenticatedRequest<Preview>(
        `${endpoint}/${kind === "PRODUCTS" ? "products" : "opening-balances"}/${preview.id}/commit`,
        {},
        "POST",
        { "Idempotency-Key": `import-${preview.id}` },
      );
      setPreview(result);
      await load();
    }, "Import committed successfully.");
  }
  async function viewBatch(id: string) {
    setBusy(true);
    setError("");
    try {
      const [batch, events] = await Promise.all([
        authenticatedRequest<BatchDetail>(`${endpoint}/${id}`),
        authenticatedRequest<BatchDetail["events"]>(`${endpoint}/${id}/audit`),
      ]);
      setSelectedBatch({ ...batch, events });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load import details.",
      );
    } finally {
      setBusy(false);
    }
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([templates[kind]], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      kind === "PRODUCTS"
        ? "stockroom-products-template.csv"
        : "stockroom-opening-balances-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">CATALOG & INVENTORY</p>
          <h1>Import data</h1>
          <p>
            Preview and validate CSV data before making changes to your
            workspace.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {notice}
        </p>
      )}
      <section className="panel">
        <div className="page-heading">
          <div>
            <h2>Prepare an import</h2>
            <p>
              Choose a workflow, download its sample, then upload your completed
              CSV.
            </p>
          </div>
          <button
            className="button button-secondary"
            onClick={downloadTemplate}
            type="button"
          >
            Download sample CSV
          </button>
        </div>
        <div className="form-grid">
          <label>
            Import type
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setPreview(null);
              }}
            >
              <option value="PRODUCTS">Products</option>
              <option value="OPENING_BALANCES">Opening balances</option>
            </select>
          </label>
          <label>
            CSV file
            <input
              accept=".csv,text/csv"
              type="file"
              onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {headers.length > 0 && (
          <div className="form-grid import-mapping">
            <h3>Match CSV columns</h3>
            {(
              preview?.fields ??
              (kind === "PRODUCTS"
                ? [
                    "sku",
                    "name",
                    "description",
                    "barcode",
                    "category",
                    "baseUnit",
                    "defaultSalePrice",
                    "saleCurrency",
                    "defaultCost",
                    "costCurrency",
                    "status",
                  ]
                : [
                    "sku",
                    "warehouseCode",
                    "quantity",
                    "unitCost",
                    "currency",
                    "reference",
                  ]
              ).map((key) => ({
                key,
                required: [
                  "sku",
                  kind === "PRODUCTS" ? "name" : "warehouseCode",
                  kind === "PRODUCTS" ? "baseUnit" : "quantity",
                  kind === "OPENING_BALANCES" ? "unitCost" : "",
                  kind === "OPENING_BALANCES" ? "currency" : "",
                ].includes(key),
              }))
            ).map((field) => (
              <label key={field.key}>
                {labels[field.key] ?? field.key}
                {field.required ? " *" : ""}
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [field.key]: e.target.value })
                  }
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={!canWrite || busy || !file}
            onClick={() => void previewCsv()}
            type="button"
          >
            {busy ? "Working…" : "Validate and preview"}
          </button>
          <small>Preview does not create products or post stock.</small>
        </div>
      </section>
      {preview && (
        <section className="panel">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{preview.kind.replaceAll("_", " ")}</p>
              <h2>
                Preview: {preview.summary.validRows} valid ·{" "}
                {preview.summary.invalidRows} with errors
              </h2>
              <p>
                {preview.summary.rowCount} rows ·{" "}
                {preview.summary.duplicateRows} duplicate rows
              </p>
            </div>
            <button
              className="button button-primary"
              disabled={
                !canWrite ||
                busy ||
                preview.status === "COMMITTED" ||
                preview.summary.invalidRows !== 0 ||
                preview.summary.rowCount === 0
              }
              onClick={() => void commit()}
              type="button"
            >
              {preview.status === "COMMITTED" ? "Committed" : "Commit import"}
            </button>
          </div>
          {preview.summary.openingTotalsByProductWarehouse?.length > 0 && (
            <p>
              Opening stock totals:{" "}
              {preview.summary.openingTotalsByProductWarehouse
                .map(
                  (x) =>
                    `${x.sku} · ${x.warehouseCode}: ${x.quantity} ${x.unit}`,
                )
                .join("; ")}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CSV row</th>
                  <th>SKU</th>
                  <th>Product / warehouse</th>
                  <th>Quantity</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row) => (
                  <tr key={row.rowId}>
                    <td>{row.rowNumber}</td>
                    <td>{row.sku}</td>
                    <td>{row.name ?? row.warehouseCode ?? "—"}</td>
                    <td>{row.quantity ?? "—"}</td>
                    <td>
                      {row.errors.length
                        ? row.errors.map((message, index) => {
                            const column = errorColumn(message, mapping);
                            return (
                              <div key={`${row.rowId}-${index}`}>
                                {column
                                  ? `Column “${column}”: `
                                  : "Row issue: "}
                                {message}
                              </div>
                            );
                          })
                        : "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Opening balances can only initialize a product in a warehouse with
            no previous stock movements. Existing inventory is never
            overwritten.
          </p>
        </section>
      )}
      <section className="panel">
        <div className="page-heading">
          <div>
            <h2>Recent imports</h2>
            <p>Up to 50 recent preview and commit records.</p>
          </div>
          <button
            className="button button-secondary"
            onClick={() => void load()}
            type="button"
          >
            Refresh
          </button>
        </div>
        {batches.length === 0 ? (
          <p>No imports yet. Your preview history will appear here.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Rows</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.fileName}</td>
                    <td>{batch.kind.replaceAll("_", " ")}</td>
                    <td>{batch.summary?.rowCount ?? 0}</td>
                    <td>{batch.status}</td>
                    <td>{new Date(batch.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        className="button button-secondary"
                        onClick={() => void viewBatch(batch.id)}
                        type="button"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedBatch && (
        <section className="panel">
          <div className="page-heading">
            <div>
              <p className="eyebrow">IMPORT HISTORY</p>
              <h2>{selectedBatch.fileName}</h2>
              <p>
                {selectedBatch.summary.rowCount} rows · {selectedBatch.status} ·{" "}
                {selectedBatch.kind.replaceAll("_", " ")}
              </p>
            </div>
            <button
              className="button button-secondary"
              onClick={() => setSelectedBatch(null)}
              type="button"
            >
              Close details
            </button>
          </div>
          <h3>Batch rows</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CSV row</th>
                  <th>SKU</th>
                  <th>Item</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {selectedBatch.previewRows.map((row) => (
                  <tr key={row.rowId}>
                    <td>{row.rowNumber}</td>
                    <td>{row.sku}</td>
                    <td>{row.name ?? row.warehouseCode ?? "—"}</td>
                    <td>
                      {row.errors.length
                        ? row.errors.join("; ")
                        : selectedBatch.status === "COMMITTED"
                          ? "Imported"
                          : "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Audit history</h3>
          {selectedBatch.events.length === 0 ? (
            <p>No commit event; this batch is still a preview.</p>
          ) : (
            <ul>
              {selectedBatch.events.map((event) => (
                <li key={event.id}>
                  {event.action} by {event.actor.email} ·{" "}
                  {new Date(event.occurredAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
